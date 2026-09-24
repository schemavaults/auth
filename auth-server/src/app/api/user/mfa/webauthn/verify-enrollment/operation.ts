import { NextRequest } from "next/server";
import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { webauthnVerifyEnrollmentBodySchema } from "@schemavaults/auth-common";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaVerifyEnrollmentResult } from "@/lib/api/domain-schemas/mfa";
import {
  ErrorResponse,
  RateLimitedResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import {
  deleteRegChallenge,
  getRegChallenge,
  issueRecoveryCodesIfNeeded,
  verifyWebauthnRegistration,
} from "@/lib/mfa";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";
import {
  WEBAUTHN_ENROLL_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

const ROUTE = "/api/user/mfa/webauthn/verify-enrollment";

export const verifyPasskeyEnrollment = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Confirm a passkey enrollment",
  description:
    "Verifies the authenticator's attestation against the challenge issued by `POST /api/user/mfa/webauthn/options`, stores the credential and activates the pending passkey factor. The challenge is consumed whatever the outcome; an expired or missing challenge is a 410 and the enrollment must be started again. Recovery codes are minted only when this becomes the caller's first verified factor (`recovery_codes_issued`); a security alert e-mail is sent. Rate limited per user and client IP.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(webauthnVerifyEnrollmentBodySchema, "MfaVerifyPasskeyEnrollmentRequest"),
      description:
        "The pending `factor_id`, the `RegistrationResponseJSON` produced by `navigator.credentials.create()` and an optional label for the passkey.",
    },
  },
  responses: {
    200: { description: "The passkey is now active", schema: MfaVerifyEnrollmentResult },
    ...validationErrorResponse,
    401: {
      description: "The attestation could not be verified (or no valid session was presented)",
      schema: ErrorResponse,
    },
    403: sessionErrorResponses[403],
    404: { description: "No such pending passkey factor for the caller", schema: ErrorResponse },
    409: { description: "The factor is already verified", schema: ErrorResponse },
    410: { description: "The enrollment challenge was not found or expired", schema: ErrorResponse },
    429: { description: "Too many enrollment attempts", schema: RateLimitedResponse },
    500: { description: "Failed to verify the enrollment", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis, environment } = ctx.context;
    // Throttle enrollment-verification attempts per uid (and per IP when
    // available); each call performs credential writes and factor flips.
    // Headers-only view of the request for the IP helper.
    const ip = extractClientIp(new NextRequest(ctx.url, { headers: ctx.request.headers }));
    const rate = await checkRateLimit(redis.client, WEBAUTHN_ENROLL_RATE_LIMIT, {
      ...(ip ? { ip } : {}),
      uid: user.uid,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    const { factor_id, label, attestation } = ctx.body;

    const mfaRegistry = new MfaRegistry(db);

    try {
      const factor = await mfaRegistry.getFactorById({ uid: user.uid, factor_id });
      if (!factor || factor.factor_type !== "webauthn") {
        return ctx.json(404, { success: false, message: "Factor not found" });
      }
      if (factor.verified) {
        return ctx.json(409, { success: false, message: "Factor already verified" });
      }

      const regChallenge = await getRegChallenge(redis.client, factor_id);
      if (!regChallenge || regChallenge.uid !== user.uid) {
        return ctx.json(410, {
          success: false,
          message: "Enrollment challenge not found or expired. Start again.",
        });
      }
      // One-shot: consume the challenge regardless of verification outcome.
      await deleteRegChallenge(redis.client, factor_id);

      const verified = await verifyWebauthnRegistration({
        response: attestation as unknown as RegistrationResponseJSON,
        expectedChallenge: regChallenge.challenge,
      });
      if (!verified) {
        return ctx.json(401, {
          success: false,
          message: "Passkey registration could not be verified",
        });
      }

      await mfaRegistry.persistWebauthnCredential({
        factor_id,
        uid: user.uid,
        credential_id: verified.credential_id,
        public_key: verified.public_key,
        counter: verified.counter,
        transports: verified.transports,
        aaguid: verified.aaguid,
        device_type: verified.device_type,
        backed_up: verified.backed_up,
        label: label ?? null,
      });

      const flipped = await mfaRegistry.verifyFactor({ uid: user.uid, factor_id });
      if (!flipped) {
        return ctx.json(409, { success: false, message: "Factor was not in a verifiable state" });
      }

      // Recovery codes are only minted for the user's first verified factor;
      // enrolling a passkey alongside existing TOTP must not rotate them.
      const { recovery_codes, recovery_codes_issued } = await issueRecoveryCodesIfNeeded(
        db,
        user.uid,
      );

      void sendMfaSecurityAlertEmail({
        to: user.email,
        action: "enabled",
        db,
        redis,
        environment,
      });

      return ctx.json(200, { success: true, recovery_codes, recovery_codes_issued });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_webauthn_verify_enrollment_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to verify passkey enrollment" });
    }
  },
});
