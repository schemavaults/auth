import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { ServerRuntime } from "next";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import { ServerlessDatabase, MfaRegistry, UserRegistry } from "@/lib/auth-db";
import {
  generateRecoveryCodes,
  generateTotpSecret,
} from "@/lib/mfa";

// Test-only helper: enrolls a user with a known TOTP secret + recovery
// codes so Cypress can compute valid codes at test time without
// scraping a QR. Body: { email, secret? }. Response: { uid, secret,
// recovery_codes }.
//
// Gated by SCHEMAVAULTS_APP_ENVIRONMENT === "test"; returns 404 in any
// other environment.

const notFoundBody = {
  error: true,
  success: false,
  message: "Route not available in this environment",
} as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (getAppEnvironment() !== "test") {
    return NextResponse.json(notFoundBody, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || !body || !("email" in body)) {
    return NextResponse.json(
      { success: false, message: "Missing email in body" },
      { status: 400 },
    );
  }
  const email = (body as { email: unknown }).email;
  if (typeof email !== "string") {
    return NextResponse.json(
      { success: false, message: "email must be a string" },
      { status: 400 },
    );
  }
  const requestedSecret =
    "secret" in body && typeof (body as { secret: unknown }).secret === "string"
      ? (body as { secret: string }).secret
      : undefined;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  const userRegistry = new UserRegistry(dbh.db);
  const user = await userRegistry.getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { success: false, message: "User not found" },
      { status: 404 },
    );
  }

  const mfaRegistry = new MfaRegistry(dbh.db);
  await mfaRegistry.deleteAllFactorsForUser(user.uid);

  const secret = requestedSecret ?? generateTotpSecret();
  const { factor_id } = await mfaRegistry.createUnverifiedFactor({
    uid: user.uid,
    secret,
  });
  const flipped = await mfaRegistry.verifyFactor({
    uid: user.uid,
    factor_id,
  });
  if (!flipped) {
    return NextResponse.json(
      { success: false, message: "Failed to verify newly-created factor" },
      { status: 500 },
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
      uid: user.uid,
      factor_id,
      secret,
      recovery_codes,
    },
    { status: 200 },
  );
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
