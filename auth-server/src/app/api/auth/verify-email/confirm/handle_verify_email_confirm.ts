import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import type { ValidEmailVerificationToken } from "@/lib/auth-db/users/validate-email-verification-token";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

const verifyEmailConfirmBodySchema = z
  .object({
    token: z.string().uuid(),
  })
  .strict();

interface HandleVerifyEmailConfirmOptions {
  body: unknown;
  req: NextRequest;
}

export async function handleVerifyEmailConfirm({
  body,
}: HandleVerifyEmailConfirmOptions): Promise<NextResponse> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(appEnv);

  const parsed = await verifyEmailConfirmBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid request body", errors: parsed.error.errors },
      { status: 400 },
    );
  }

  const { token } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  const userRegistry = new UserRegistry(dbh.db, debug);

  let validToken: ValidEmailVerificationToken | null;
  try {
    validToken = await userRegistry.validateEmailVerificationToken(token);
  } catch (e: unknown) {
    console.error("[handleVerifyEmailConfirm] Failed to validate token:", e);
    return NextResponse.json(
      { success: false, message: "Failed to validate verification token" },
      { status: 500 },
    );
  }

  if (!validToken) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired verification token" },
      { status: 400 },
    );
  }

  try {
    await userRegistry.markEmailVerified(validToken.uid);
    await userRegistry.consumeEmailVerificationToken(validToken.token_id);
  } catch (e: unknown) {
    console.error("[handleVerifyEmailConfirm] Failed to mark email as verified:", e);
    return NextResponse.json(
      { success: false, message: "Failed to verify email" },
      { status: 500 },
    );
  }

  if (debug) {
    console.log(`[handleVerifyEmailConfirm] Email verified for uid: ${validToken.uid}`);
  }

  return NextResponse.json(
    { success: true, message: "Email has been verified successfully" },
    { status: 200 },
  );
}

export default handleVerifyEmailConfirm;
