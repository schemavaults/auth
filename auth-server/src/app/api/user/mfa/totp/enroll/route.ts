import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  renderQrPngDataUrl,
} from "@/lib/mfa";
import {
  MFA_ENROLL_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";

const ROUTE = "/api/user/mfa/totp/enroll";

async function POST_enroll_totp_handler(
  { user, dbh, redis }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const ipResult = await checkRateLimit(redis.client, MFA_ENROLL_RATE_LIMIT, {
      ip: user.uid,
    });
    if (!ipResult.allowed) return rateLimitResponse(ipResult);

    const mfaRegistry = new MfaRegistry(dbh.db);
    if (await mfaRegistry.hasVerifiedFactor(user.uid)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "MFA is already enabled. Remove the existing factor before enrolling a new one.",
        },
        { status: 409 },
      );
    }

    await mfaRegistry.sweepStaleUnverifiedFactors(user.uid);

    const secret = generateTotpSecret();
    const { factor_id } = await mfaRegistry.createUnverifiedFactor({
      uid: user.uid,
      secret,
    });
    // White-label issuer: authenticator apps display this next to the
    // account label for new enrollments.
    const otpauth_url = buildOtpAuthUrl({
      account_label: user.email ?? user.uid,
      secret,
      issuer: getAuthServerFriendlyName(),
    });
    const qr_code_data_url = await renderQrPngDataUrl(otpauth_url);

    return NextResponse.json(
      {
        factor_id,
        factor_type: "totp",
        otpauth_url,
        qr_code_data_url,
        secret,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_enroll_totp_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to start TOTP enrollment" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = extractClientIp(req);
  if (!ip) return ipRequiredResponse();
  return await (await withAuthenticatedApiRouteGuard(POST_enroll_totp_handler))(
    req,
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
