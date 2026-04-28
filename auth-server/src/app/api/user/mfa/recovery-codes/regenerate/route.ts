import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { MfaRegistry } from "@/lib/auth-db";
import { generateRecoveryCodes, verifyTotpCode } from "@/lib/mfa";
import { mfaCodeOnlyBodySchema } from "@schemavaults/auth-common";
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
  const parsed = await mfaCodeOnlyBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { code } = parsed.data;

  const mfaRegistry = new MfaRegistry(dbh.db);

  try {
    const verified = await mfaRegistry.getVerifiedFactor(user.uid);
    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          message: "MFA is not enabled — nothing to regenerate.",
        },
        { status: 409 },
      );
    }
    if (!verifyTotpCode({ secret: verified.secret, code })) {
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
      { success: true, recovery_codes },
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
