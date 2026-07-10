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
import { getAuthServerUrl } from "@schemavaults/app-definitions";
import sendEmailViaMailServer from "@/lib/mail/send-email-via-mail-server";
import captureServerException from "@/lib/captureServerException";
import { RedisCache } from "@/lib/redis";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";

const ROUTE = "/api/auth/reset-password/request";

const resetPasswordRequestBodySchema = z
  .object({
    email: z.string().email(),
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

  try {
    const rawToken: string = await userRegistry.createPasswordResetToken(user.uid);
    const authServerUri: string = getAuthServerUrl(appEnv);
    const resetLink: string = `${authServerUri}/auth/reset-password?token=${rawToken}`;
    const friendlyName: string = getAuthServerFriendlyName();

    await sendEmailViaMailServer(
      {
        to: email,
        subject: `Reset your ${friendlyName} password`,
        message: {
          text: `You requested a password reset for your ${friendlyName} account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
          html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
<h2>Reset your password</h2>
<p>You requested a password reset for your ${friendlyName} account.</p>
<p>Click the button below to set a new password:</p>
<p style="margin: 24px 0;">
  <a href="${resetLink}" style="background-color: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset Password</a>
</p>
<p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
<p style="color: #666; font-size: 14px;">If you did not request this, you can safely ignore this email.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
<p style="color: #999; font-size: 12px;">${friendlyName}</p>
</div>`,
        },
      },
      dbh.db,
      redis
    );

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
