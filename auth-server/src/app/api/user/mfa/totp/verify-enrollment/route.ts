import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  decryptSecret,
  generateRecoveryCodes,
  verifyTotpCode,
} from "@/lib/mfa";
import { mfaVerifyEnrollmentBodySchema } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/totp/verify-enrollment";

async function POST_verify_enrollment_handler(
  { user, dbh, req }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }
  const parsed = await mfaVerifyEnrollmentBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { factor_id, code } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    const factor = await mfaRegistry.getFactorById({
      uid: user.uid,
      factor_id,
    });
    if (!factor) {
      return NextResponse.json(
        { success: false, message: "Factor not found" },
        { status: 404 },
      );
    }
    if (factor.verified) {
      return NextResponse.json(
        { success: false, message: "Factor already verified" },
        { status: 409 },
      );
    }

    const secret = decryptSecret(
      factor.secret_ciphertext,
      factor.kek_version,
    );
    const isValid = verifyTotpCode({ secret, code });
    if (!isValid) {
      return NextResponse.json(
        { success: false, message: "Invalid TOTP code" },
        { status: 401 },
      );
    }

    const flipped = await mfaRegistry.verifyFactor({
      uid: user.uid,
      factor_id,
    });
    if (!flipped) {
      return NextResponse.json(
        { success: false, message: "Factor was not in a verifiable state" },
        { status: 409 },
      );
    }

    const recovery_codes = generateRecoveryCodes();
    await mfaRegistry.replaceRecoveryCodes({
      uid: user.uid,
      codes: recovery_codes,
    });

    // Notify the user that MFA was enabled. Best-effort.
    void sendMfaSecurityAlertEmail({
      to: user.email,
      action: "enabled",
      db: dbh.db,
    });

    return NextResponse.json(
      { success: true, recovery_codes },
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_verify_enrollment_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to verify enrollment" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(
    POST_verify_enrollment_handler,
  ))(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
