import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { mfaVerifyEnrollmentBodySchema } from "@schemavaults/auth-common";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaVerifyEnrollmentResult } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { decryptSecret, issueRecoveryCodesIfNeeded, verifyTotpCode } from "@/lib/mfa";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/totp/verify-enrollment";

export const verifyTotpEnrollment = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Confirm a TOTP enrollment",
  description:
    "Activates the pending authenticator-app factor named by `factor_id` once the caller submits a current code from it. Recovery codes are minted only when this becomes the caller's first verified factor (`recovery_codes_issued`); a security alert e-mail is sent.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(mfaVerifyEnrollmentBodySchema, "MfaVerifyTotpEnrollmentRequest"),
    },
  },
  responses: {
    200: { description: "The factor is now active", schema: MfaVerifyEnrollmentResult },
    ...validationErrorResponse,
    401: {
      description: "The code did not match the factor (or no valid session was presented)",
      schema: ErrorResponse,
    },
    403: sessionErrorResponses[403],
    404: { description: "No such pending factor for the caller", schema: ErrorResponse },
    409: { description: "The factor is already verified", schema: ErrorResponse },
    500: { description: "Failed to verify the enrollment", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis, environment } = ctx.context;
    const { factor_id, code } = ctx.body;

    const mfaRegistry = new MfaRegistry(db);

    try {
      const factor = await mfaRegistry.getFactorById({ uid: user.uid, factor_id });
      if (!factor) {
        return ctx.json(404, { success: false, message: "Factor not found" });
      }
      if (factor.verified) {
        return ctx.json(409, { success: false, message: "Factor already verified" });
      }

      if (
        factor.factor_type !== "totp" ||
        factor.secret_ciphertext === null ||
        factor.kek_version === null
      ) {
        return ctx.json(400, { success: false, message: "Factor is not a TOTP factor" });
      }
      const secret = decryptSecret(factor.secret_ciphertext, factor.kek_version);
      const isValid = verifyTotpCode({ secret, code });
      if (!isValid) {
        return ctx.json(401, { success: false, message: "Invalid TOTP code" });
      }

      const flipped = await mfaRegistry.verifyFactor({ uid: user.uid, factor_id });
      if (!flipped) {
        return ctx.json(409, { success: false, message: "Factor was not in a verifiable state" });
      }

      // Recovery codes are minted only for the user's first verified factor;
      // if they already have a passkey (and thus recovery codes), enrolling
      // TOTP must not rotate the codes they already saved.
      const { recovery_codes, recovery_codes_issued } = await issueRecoveryCodesIfNeeded(
        db,
        user.uid,
      );

      // Notify the user that MFA was enabled. Best-effort.
      await sendMfaSecurityAlertEmail({
        to: user.email,
        action: "enabled",
        db,
        redis,
        environment,
      });

      return ctx.json(200, { success: true, recovery_codes, recovery_codes_issued });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_verify_enrollment_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to verify enrollment" });
    }
  },
});
