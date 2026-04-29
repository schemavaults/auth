import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/verify-email/confirm";

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

  let result: { uid: string } | null;
  try {
    result = await userRegistry.validateAndConsumeEmailVerificationToken(token);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleVerifyEmailConfirm.validateAndConsumeEmailVerificationToken",
      route: ROUTE,
    });
    return NextResponse.json(
      { success: false, message: "Failed to verify email" },
      { status: 500 },
    );
  }

  if (!result) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired verification token" },
      { status: 400 },
    );
  }

  if (debug) {
    console.log(`[handleVerifyEmailConfirm] Email verified for uid: ${result.uid}`);
  }

  return NextResponse.json(
    { success: true, message: "Email has been verified successfully" },
    { status: 200 },
  );
}

export default handleVerifyEmailConfirm;
