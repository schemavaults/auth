import { NextRequest } from "next/server";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaWebauthnEnrollOptions } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, RateLimitedResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { generateWebauthnRegistrationOptions, putRegChallenge } from "@/lib/mfa";
import {
  WEBAUTHN_ENROLL_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";

const ROUTE = "/api/user/mfa/webauthn/options";

export const beginPasskeyEnrollment = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Start a passkey enrollment",
  description:
    "Creates a pending passkey factor for the caller and returns the WebAuthn registration options (`PublicKeyCredentialCreationOptionsJSON`) for `navigator.credentials.create()`; already enrolled passkeys are excluded so the authenticator will not register a duplicate. Confirm the enrollment with `POST /api/user/mfa/webauthn/verify-enrollment`; the challenge expires after a short time. Abandoned enrollments are swept first. Any request body is ignored. Rate limited per user and client IP.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The pending enrollment", schema: MfaWebauthnEnrollOptions },
    400: { description: "The client IP address could not be determined", schema: ErrorResponse },
    ...sessionErrorResponses,
    429: { description: "Too many enrollment attempts", schema: RateLimitedResponse },
    500: { description: "Failed to start the enrollment", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    // Headers-only view of the request for the IP helper.
    const ip = extractClientIp(new NextRequest(ctx.url, { headers: ctx.request.headers }));
    if (!ip) return ipRequiredResponse();
    try {
      // Key the limiter on the real client IP AND the uid, so the bucket
      // can't be shared/bypassed and the per-account cap is enforced.
      const rate = await checkRateLimit(redis.client, WEBAUTHN_ENROLL_RATE_LIMIT, {
        ip,
        uid: user.uid,
      });
      if (!rate.allowed) return rateLimitResponse(rate);

      const mfaRegistry = new MfaRegistry(db);

      // Drop any abandoned half-finished enrollments before starting a new one.
      await mfaRegistry.sweepStaleUnverifiedFactors(user.uid);

      // Exclude the user's existing passkeys so the authenticator won't
      // register a duplicate of one already enrolled.
      const existing = (await mfaRegistry.listWebauthnCredentialsForUser(user.uid)).filter(
        (c) => c.verified,
      );

      const { factor_id } = await mfaRegistry.createUnverifiedWebauthnFactor({ uid: user.uid });

      const options = await generateWebauthnRegistrationOptions({
        uid: user.uid,
        userName: user.email ?? user.uid,
        excludeCredentials: existing.map((c) => ({
          credential_id: c.credential_id,
          transports: c.transports,
        })),
      });

      await putRegChallenge(redis.client, {
        factor_id,
        uid: user.uid,
        challenge: options.challenge,
      });

      const parsed = MfaWebauthnEnrollOptions.safeParse({
        factor_id,
        // The ceremony options are an opaque JSON blob handed to the browser
        // verbatim; the response schema only asserts it's an object.
        options: options as unknown as Record<string, unknown>,
      });
      if (!parsed.success) {
        await captureServerException(db, parsed.error, {
          op_name: "POST_webauthn_options_handler:response_schema_mismatch",
          route: ROUTE,
          uid: user.uid,
        });
        return ctx.json(500, { success: false, message: "Failed to start passkey enrollment" });
      }
      return ctx.json(200, parsed.data);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_webauthn_options_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to start passkey enrollment" });
    }
  },
});
