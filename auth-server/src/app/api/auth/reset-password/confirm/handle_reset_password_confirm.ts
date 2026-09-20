import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { passwordSchema } from "@schemavaults/auth-common";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import captureServerException from "@/lib/captureServerException";
import { RedisCache } from "@/lib/redis";
import { invalidateUserTokensValidAfterCache } from "@/lib/token-revocation";

const ROUTE = "/api/auth/reset-password/confirm";

const resetPasswordConfirmBodySchema = z
  .object({
    token: z.guid(),
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
      { success: false, message: "Invalid request body", errors: parsed.error.issues },
      { status: 400 },
    );
  }

  const { token, new_password } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  const userRegistry = new UserRegistry(dbh.db, debug);

  let result: { uid: string } | null;
  try {
    result = await userRegistry.validateAndConsumePasswordResetToken(
      token,
      new_password,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleResetPasswordConfirm.validateAndConsumePasswordResetToken",
      route: ROUTE,
    });
    return NextResponse.json(
      { success: false, message: "Failed to reset password" },
      { status: 500 },
    );
  }

  if (!result) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired reset token" },
      { status: 400 },
    );
  }

  if (debug) {
    console.log(`[handleResetPasswordConfirm] Password reset for uid: ${result.uid}`);
  }

  // The reset bumped the user's tokens_valid_after watermark inside the
  // password transaction; drop the route guards' cached copy so every
  // pre-reset session is rejected immediately, not after the cache TTL.
  // Best effort: a Redis outage only delays enforcement by that TTL.
  try {
    await using redis = RedisCache.createConnection();
    await invalidateUserTokensValidAfterCache(redis, result.uid);
  } catch (e: unknown) {
    console.warn(
      `[handleResetPasswordConfirm] Could not invalidate the cached tokens_valid_after watermark for uid '${result.uid}': `,
      e,
    );
  }

  return NextResponse.json(
    { success: true, message: "Password has been reset successfully" },
    { status: 200 },
  );
}

export default handleResetPasswordConfirm;
