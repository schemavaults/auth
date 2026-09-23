import { NextRequest } from "next/server";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaTotpEnrollment } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, RateLimitedResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import { buildOtpAuthUrl, generateTotpSecret, renderQrPngDataUrl } from "@/lib/mfa";
import {
  MFA_ENROLL_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";

const ROUTE = "/api/user/mfa/totp/enroll";

export const enrollTotp = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Start a TOTP enrollment",
  description:
    "Creates a pending authenticator-app factor for the caller and returns the secret, the `otpauth://` URL and its QR code. Confirm it with `POST /api/user/mfa/totp/verify-enrollment`. Refused while the caller already has a verified factor; abandoned enrollments are swept first. Any request body is ignored. Rate limited per user.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The pending enrollment", schema: MfaTotpEnrollment },
    400: { description: "The client IP address could not be determined", schema: ErrorResponse },
    ...sessionErrorResponses,
    409: { description: "MFA is already enabled on the account", schema: ErrorResponse },
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
      const ipResult = await checkRateLimit(redis.client, MFA_ENROLL_RATE_LIMIT, { ip: user.uid });
      if (!ipResult.allowed) return rateLimitResponse(ipResult);

      const mfaRegistry = new MfaRegistry(db);
      if (await mfaRegistry.hasVerifiedFactor(user.uid)) {
        return ctx.json(409, {
          success: false,
          message: "MFA is already enabled. Remove the existing factor before enrolling a new one.",
        });
      }

      await mfaRegistry.sweepStaleUnverifiedFactors(user.uid);

      const secret = generateTotpSecret();
      const { factor_id } = await mfaRegistry.createUnverifiedFactor({ uid: user.uid, secret });
      // White-label issuer: authenticator apps display this next to the
      // account label for new enrollments.
      const otpauth_url = buildOtpAuthUrl({
        account_label: user.email ?? user.uid,
        secret,
        issuer: getAuthServerFriendlyName(),
      });
      const qr_code_data_url = await renderQrPngDataUrl(otpauth_url);

      return ctx.json(200, { factor_id, factor_type: "totp", otpauth_url, qr_code_data_url, secret });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_enroll_totp_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to start TOTP enrollment" });
    }
  },
});
