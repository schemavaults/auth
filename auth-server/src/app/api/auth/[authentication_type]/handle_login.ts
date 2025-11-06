import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import {
  emailCredentialsSchema,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { getAppEnvironment } from "@schemavaults/app-definitions";

interface HandleLoginOptions {
  body: unknown;
}

// POST body for /api/auth/login
const loginBodySchema = z
  .object({
    credentials: emailCredentialsSchema,
    code_challenge: PKCE_ProofKeyManager.codeChallengeSchema,
    challenge_time: z.number().nonnegative(),
  })
  .required({
    credentials: true,
    code_challenge: true,
    challenge_time: true,
  })
  .strict();

export async function handleLogin({
  body,
}: HandleLoginOptions): Promise<NextResponse> {
  const appEnv = getAppEnvironment();

  const parse_login_body = await loginBodySchema.safeParseAsync(body);
  if (!parse_login_body.success) {
    return NextResponse.json(parse_login_body.error, { status: 400 });
  }
  const email_credentials = parse_login_body.data.credentials;
  const code_challenge: string = parse_login_body.data.code_challenge;
  const challenge_time: number = parse_login_body.data.challenge_time;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to user registry",
      },
      {
        status: 500,
      },
    );
  }

  // Check if email exists in db
  let user: UserDocument | null;
  try {
    user = await userRegistry.getUserByEmail(email_credentials.email);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to query user",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: "User not found",
      } satisfies AuthenticateResult,
      {
        status: 404,
      },
    );
  }

  if (appEnv === "development" || appEnv === "test") {
    console.log(`Found user with email ${email_credentials.email}`);
  }

  const uid: string = user.uid;

  let compare_password_result: boolean = false;
  try {
    if (appEnv === "development") {
      console.log(`Comparing password for user with uid: ${uid}`);
    }
    compare_password_result = await userRegistry.comparePassword(
      uid,
      email_credentials.password,
    );
  } catch (e: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to compare password",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  if (!compare_password_result) {
    console.error("[handleLogin] Incorrect password");
    return NextResponse.json(
      {
        success: false,
        message: "Incorrect password",
      } satisfies AuthenticateResult,
      {
        status: 401,
      },
    );
  }

  if (appEnv === "development") {
    console.log(`Login successful as ${email_credentials.email} (uid: ${uid})`);
  }

  let authorization_code: string;
  try {
    authorization_code = await userRegistry.generateAuthorizationCode(
      uid,
      code_challenge,
      "S256",
      challenge_time,
    );
  } catch (e: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate authorization code",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Login successful",
      authorization_code,
    } satisfies AuthenticateResult,
    {
      status: 200,
    },
  );
}
