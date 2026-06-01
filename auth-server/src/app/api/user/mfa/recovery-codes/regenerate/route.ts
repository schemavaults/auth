import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import { generateRecoveryCodes, verifyTotpCode } from "@/lib/mfa";
import {
  mfaTotpProofBodySchema,
  type MfaVerifyEnrollmentResponse,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/recovery-codes/regenerate";

async function POST_regenerate_handler(
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
  const parsed = await mfaTotpProofBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { factor_id, code } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    // Authorize with a TOTP code from the named verified factor — one
    // targeted lookup. A null result means the caller named a factor that
    // isn't a verified factor of theirs (or MFA isn't enabled at all).
    const factor = await mfaRegistry.getVerifiedFactorById({
      uid: user.uid,
      factor_id,
    });
    if (!factor) {
      return NextResponse.json(
        { success: false, message: "Unknown or unverified MFA factor" },
        { status: 400 },
      );
    }
    if (!verifyTotpCode({ secret: factor.secret, code })) {
      return NextResponse.json(
        { success: false, message: "Invalid TOTP code" },
        { status: 401 },
      );
    }
    const recovery_codes = generateRecoveryCodes();
    await mfaRegistry.replaceRecoveryCodes({
      uid: user.uid,
      codes: recovery_codes,
    });
    return NextResponse.json(
      {
        success: true,
        recovery_codes,
        // Regeneration always issues a fresh set by definition.
        recovery_codes_issued: true,
      } satisfies MfaVerifyEnrollmentResponse,
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_regenerate_handler",
      route: ROUTE,
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to regenerate recovery codes" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(POST_regenerate_handler))(
    req,
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
