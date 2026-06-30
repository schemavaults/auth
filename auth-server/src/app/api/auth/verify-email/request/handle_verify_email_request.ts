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
import sendVerificationEmail from "@/lib/mail/send-verification-email";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/verify-email/request";

const verifyEmailRequestBodySchema = z
  .object({
    email: z.string().email(),
  })
  .required({
    email: true,
  })
  .strict();

interface HandleVerifyEmailRequestOptions {
  body: unknown;
  req: NextRequest;
}

const GENERIC_SUCCESS_MESSAGE =
  "If an account with that email exists, a verification email has been sent.";

export async function handleVerifyEmailRequest({
  body,
}: HandleVerifyEmailRequestOptions): Promise<NextResponse> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(appEnv);

  const parsed = await verifyEmailRequestBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  const { email } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  const userRegistry = new UserRegistry(dbh.db, debug);

  let user: UserDocument | null;
  try {
    user = await userRegistry.getUserByEmail(email);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleVerifyEmailRequest.getUserByEmail",
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
      console.log(`[handleVerifyEmailRequest] No user found for email: ${email}`);
    }
    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 },
    );
  }

  if (user.email_verified) {
    if (debug) {
      console.log(`[handleVerifyEmailRequest] User ${email} is already verified; skipping send`);
    }
    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { status: 200 },
    );
  }

  try {
    const rawToken: string = await userRegistry.createEmailVerificationToken(user.uid);
    await sendVerificationEmail({
      email,
      rawToken,
      db: dbh.db,
    });

    if (debug) {
      console.log(`[handleVerifyEmailRequest] Verification email sent to: ${email}`);
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleVerifyEmailRequest.createTokenOrSendEmail",
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

export default handleVerifyEmailRequest;
