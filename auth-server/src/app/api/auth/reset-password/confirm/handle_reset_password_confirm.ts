import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import type { ValidPasswordResetToken } from "@/lib/auth-db/users/validate-password-reset-token";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passwordSchema } from "@schemavaults/auth-common";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

const resetPasswordConfirmBodySchema = z
  .object({
    token: z.string().uuid(),
    new_password: passwordSchema,
  })
  .strict();

interface HandleResetPasswordConfirmOptions {
  body: unknown;
  req: NextRequest;
}

export async function handleResetPasswordConfirm({
  body,
}: HandleResetPasswordConfirmOptions): Promise<NextResponse> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(appEnv);

  const parsed = await resetPasswordConfirmBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid request body", errors: parsed.error.errors },
      { status: 400 },
    );
  }

  const { token, new_password } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  const userRegistry = new UserRegistry(dbh.db, debug);

  let validToken: ValidPasswordResetToken | null;
  try {
    validToken = await userRegistry.validatePasswordResetToken(token);
  } catch (e: unknown) {
    console.error("[handleResetPasswordConfirm] Failed to validate token:", e);
    return NextResponse.json(
      { success: false, message: "Failed to validate reset token" },
      { status: 500 },
    );
  }

  if (!validToken) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  try {
    await userRegistry.updatePassword(validToken.uid, new_password);
    await userRegistry.consumePasswordResetToken(validToken.token_id);
  } catch (e: unknown) {
    console.error("[handleResetPasswordConfirm] Failed to update password:", e);
    return NextResponse.json(
      { success: false, message: "Failed to reset password" },
      { status: 500 },
    );
  }

  if (debug) {
    console.log(`[handleResetPasswordConfirm] Password reset for uid: ${validToken.uid}`);
  }

  return NextResponse.json(
    { success: true, message: "Password has been reset successfully" },
    { status: 200 },
  );
}

export default handleResetPasswordConfirm;
