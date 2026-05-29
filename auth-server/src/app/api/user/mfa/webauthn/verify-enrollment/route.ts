import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import {
  verifyWebauthnRegistration,
  getRegChallenge,
  deleteRegChallenge,
  issueRecoveryCodesIfNeeded,
} from "@/lib/mfa";
import {
  webauthnVerifyEnrollmentBodySchema,
  type MfaVerifyEnrollmentResponse,
} from "@schemavaults/auth-common";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/user/mfa/webauthn/verify-enrollment";

async function POST_webauthn_verify_enrollment_handler(
  { user, dbh, req, redis }: IProtectedAuthenticatedApiRouteProps,
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
  const parsed = await webauthnVerifyEnrollmentBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { factor_id, label, attestation } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    const factor = await mfaRegistry.getFactorById({
      uid: user.uid,
      factor_id,
    });
    if (!factor || factor.factor_type !== "webauthn") {
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

    const regChallenge = await getRegChallenge(redis.client, factor_id);
    if (!regChallenge || regChallenge.uid !== user.uid) {
      return NextResponse.json(
        {
          success: false,
          message: "Enrollment challenge not found or expired. Start again.",
        },
        { status: 410 },
      );
    }
    // One-shot: consume the challenge regardless of verification outcome.
    await deleteRegChallenge(redis.client, factor_id);

    const verified = await verifyWebauthnRegistration({
      response: attestation as unknown as RegistrationResponseJSON,
      expectedChallenge: regChallenge.challenge,
    });
    if (!verified) {
      return NextResponse.json(
        { success: false, message: "Passkey registration could not be verified" },
        { status: 401 },
      );
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

    // Recovery codes are only minted for the user's first verified factor;
    // enrolling a passkey alongside existing TOTP must not rotate them.
    const { recovery_codes, recovery_codes_issued } =
      await issueRecoveryCodesIfNeeded(mfaRegistry, user.uid);

    void sendMfaSecurityAlertEmail({
      to: user.email,
      action: "enabled",
      db: dbh.db,
    });

    return NextResponse.json(
      {
        success: true,
        recovery_codes,
        recovery_codes_issued,
      } satisfies MfaVerifyEnrollmentResponse,
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_webauthn_verify_enrollment_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to verify passkey enrollment" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (
    await withAuthenticatedApiRouteGuard(
      POST_webauthn_verify_enrollment_handler,
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
