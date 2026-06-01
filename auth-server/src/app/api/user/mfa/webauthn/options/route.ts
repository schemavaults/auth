import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  generateWebauthnRegistrationOptions,
  putRegChallenge,
} from "@/lib/mfa";
import {
  WEBAUTHN_ENROLL_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";
import {
  webauthnEnrollOptionsResponseSchema,
  type WebauthnEnrollOptionsResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/webauthn/options";

async function POST_webauthn_options_handler(
  { user, dbh, redis, req }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    // Key the limiter on the real client IP (the POST wrapper already
    // rejected requests without one) AND the uid, so the bucket can't be
    // shared/bypassed and the per-account cap is enforced.
    const ip = extractClientIp(req);
    const rate = await checkRateLimit(redis.client, WEBAUTHN_ENROLL_RATE_LIMIT, {
      ...(ip ? { ip } : {}),
      uid: user.uid,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    const mfaRegistry = new MfaRegistry(dbh.db);

    // Drop any abandoned half-finished enrollments before starting a new one.
    await mfaRegistry.sweepStaleUnverifiedFactors(user.uid);

    // Exclude the user's existing passkeys so the authenticator won't
    // register a duplicate of one already enrolled.
    const existing = (
      await mfaRegistry.listWebauthnCredentialsForUser(user.uid)
    ).filter((c) => c.verified);

    const { factor_id } = await mfaRegistry.createUnverifiedWebauthnFactor({
      uid: user.uid,
    });

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

    const payload: WebauthnEnrollOptionsResponse = {
      factor_id,
      // The ceremony options are an opaque JSON blob handed to the browser
      // verbatim; the response schema only asserts it's an object.
      options: options as unknown as Record<string, unknown>,
    };
    const parsed = webauthnEnrollOptionsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      await captureServerException(dbh.db, parsed.error, {
        op_name: "POST_webauthn_options_handler:response_schema_mismatch",
        route: ROUTE,
        uid: user.uid,
      });
      return NextResponse.json(
        { success: false, message: "Failed to start passkey enrollment" },
        { status: 500 },
      );
    }
    return NextResponse.json(parsed.data, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_webauthn_options_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to start passkey enrollment" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = extractClientIp(req);
  if (!ip) return ipRequiredResponse();
  return await (
    await withAuthenticatedApiRouteGuard(POST_webauthn_options_handler)
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
