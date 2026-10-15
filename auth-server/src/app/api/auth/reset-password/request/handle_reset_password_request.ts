import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import sendPasswordResetEmail from "@/lib/mail/send-password-reset-email";
import captureServerException from "@/lib/captureServerException";
import { RedisCache } from "@/lib/redis";

const ROUTE = "/api/auth/reset-password/request";

const resetPasswordRequestBodySchema = z
  .object({
    email: z.email(),
  })
  .required({
    email: true
  })
  .strict();

interface HandleResetPasswordRequestOptions {
  body: unknown;
  req: NextRequest;
}

const GENERIC_SUCCESS_MESSAGE = "If an account with that email exists, a password reset link has been sent.";

export async function handleResetPasswordRequest({
  body,
}: HandleResetPasswordRequestOptions): Promise<NextResponse> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(appEnv);

  const parsed = await resetPasswordRequestBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();
  await using redis = RedisCache.createConnection();

  const userRegistry = new UserRegistry(dbh.db, debug);

  let user: UserDocument | null;
  try {
    user = await userRegistry.getUserByEmail(email);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleResetPasswordRequest.getUserByEmail",
      route: ROUTE,
    });
    // Still return generic success to prevent email enumeration
    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 },
    );
  }

  if (!user) {
    if (debug) {
      console.log(`[handleResetPasswordRequest] No user found for email: ${email}`);
    }
    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 },
    );
  }

  if (typeof user.service_account_app_id === "string") {
    // Service accounts have no password to reset and no mailbox to
    // deliver to; keep the generic answer so nothing is enumerable.
    if (debug) {
      console.log(
        `[handleResetPasswordRequest] Ignoring reset request for service account: ${email}`,
      );
    }
    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 },
    );
  }

  try {
    const rawToken: string = await userRegistry.createPasswordResetToken(user.uid);
    await sendPasswordResetEmail({
      email,
      rawToken,
      db: dbh.db,
      redis,
      uid: user.uid,
      source: "user_request",
    });

    if (debug) {
      console.log(`[handleResetPasswordRequest] Reset email sent to: ${email}`);
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleResetPasswordRequest.createTokenOrSendEmail",
      route: ROUTE,
      uid: user.uid,
    });
    // Still return generic success to prevent email enumeration
  }

  return NextResponse.json(
    { success: true, message: GENERIC_SUCCESS_MESSAGE },
    { status: 200 },
  );
}

export default handleResetPasswordRequest;
