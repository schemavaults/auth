import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { mfaTotpProofBodySchema } from "@schemavaults/auth-common";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaVerifyEnrollmentResult } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { generateRecoveryCodes, verifyTotpCode } from "@/lib/mfa";

const ROUTE = "/api/user/mfa/recovery-codes/regenerate";

export const regenerateRecoveryCodes = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Regenerate my recovery codes",
  description:
    "Replaces the caller's recovery codes with a fresh set, invalidating every previous code. The request must carry a current code from one of the caller's verified authenticator-app factors (`factor_id`). The response always has `recovery_codes_issued: true`.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(mfaTotpProofBodySchema, "MfaRegenerateRecoveryCodesRequest"),
      description: "The verified TOTP factor to prove control of, and a current code from it.",
    },
  },
  responses: {
    200: { description: "The new recovery codes", schema: MfaVerifyEnrollmentResult },
    400: {
      description:
        "The body failed validation, or `factor_id` is not one of the caller's verified factors",
      schema: validationErrorResponse[400].schema,
    },
    401: {
      description: "The code did not match the factor (or no valid session was presented)",
      schema: ErrorResponse,
    },
    403: sessionErrorResponses[403],
    500: { description: "Failed to regenerate the recovery codes", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { factor_id, code } = ctx.body;

    const mfaRegistry = new MfaRegistry(db);

    try {
      // Authorize with a TOTP code from the named verified factor — one
      // targeted lookup. A null result means the caller named a factor that
      // isn't a verified factor of theirs (or MFA isn't enabled at all).
      const factor = await mfaRegistry.getVerifiedFactorById({ uid: user.uid, factor_id });
      if (!factor) {
        return ctx.json(400, { success: false, message: "Unknown or unverified MFA factor" });
      }
      if (!verifyTotpCode({ secret: factor.secret, code })) {
        return ctx.json(401, { success: false, message: "Invalid TOTP code" });
      }
      const recovery_codes = generateRecoveryCodes();
      await mfaRegistry.replaceRecoveryCodes({ uid: user.uid, codes: recovery_codes });
      return ctx.json(200, {
        success: true,
        recovery_codes,
        // Regeneration always issues a fresh set by definition.
        recovery_codes_issued: true,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_regenerate_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to regenerate recovery codes" });
    }
  },
});
