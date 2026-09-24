import { NextRequest } from "next/server";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaWebauthnStepUpOptions } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, RateLimitedResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { generateWebauthnAuthenticationOptions, putStepUpChallenge } from "@/lib/mfa";
import {
  WEBAUTHN_STEP_UP_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

const ROUTE = "/api/user/mfa/webauthn/authenticate-options";

// Issues a WebAuthn assertion challenge so an authenticated user can re-prove
// possession of a passkey when authorizing a sensitive action (removing a
// passkey). The challenge is stored server-side keyed by uid and consumed by
// the DELETE handler. Distinct from the unauthenticated login-time options
// endpoint under /api/auth/mfa/webauthn/options.
export const beginPasskeyStepUp = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Start a passkey step-up verification",
  description:
    "Issues WebAuthn authentication options (`PublicKeyCredentialRequestOptionsJSON`) restricted to the caller's enrolled passkeys, so a signed-in user can re-prove possession of one before a sensitive action such as `DELETE /api/user/mfa/webauthn/{factor_id}`. One step-up challenge is kept per user; each call replaces it. Refused when the caller has no verified passkey. Any request body is ignored. Rate limited per user and client IP.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The assertion options", schema: MfaWebauthnStepUpOptions },
    ...sessionErrorResponses,
    409: { description: "The caller has no enrolled passkey", schema: ErrorResponse },
    429: { description: "Too many step-up challenges requested", schema: RateLimitedResponse },
    500: { description: "Failed to start the passkey verification", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    try {
      // Throttle step-up challenge minting per uid (and per IP when available);
      // each call overwrites the user's stored challenge and touches the DB.
      // Headers-only view of the request for the IP helper.
      const ip = extractClientIp(new NextRequest(ctx.url, { headers: ctx.request.headers }));
      const rate = await checkRateLimit(redis.client, WEBAUTHN_STEP_UP_RATE_LIMIT, {
        ...(ip ? { ip } : {}),
        uid: user.uid,
      });
      if (!rate.allowed) return rateLimitResponse(rate);

      const mfaRegistry = new MfaRegistry(db);
      const verified = (await mfaRegistry.listWebauthnCredentialsForUser(user.uid)).filter(
        (c) => c.verified,
      );

      if (verified.length === 0) {
        return ctx.json(409, { success: false, message: "No passkeys enrolled" });
      }

      const options = await generateWebauthnAuthenticationOptions({
        allowCredentials: verified.map((c) => ({
          credential_id: c.credential_id,
          transports: c.transports,
        })),
      });

      await putStepUpChallenge(redis.client, { uid: user.uid, challenge: options.challenge });

      const parsed = MfaWebauthnStepUpOptions.safeParse({
        options: options as unknown as Record<string, unknown>,
      });
      if (!parsed.success) {
        await captureServerException(db, parsed.error, {
          op_name: "POST_step_up_options_handler:response_schema_mismatch",
          route: ROUTE,
          uid: user.uid,
        });
        return ctx.json(500, { success: false, message: "Failed to start passkey verification" });
      }
      return ctx.json(200, parsed.data);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_step_up_options_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to start passkey verification" });
    }
  },
});
