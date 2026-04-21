import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import {
  emailCredentialsSchema,
  ERROR_MESSAGE_CATALOG,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import type { UserData } from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { appIdSchema, getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import setAuthServerRefreshTokenCookie from "@/lib/setAuthServerRefreshTokenCookie";
import { doesRequestHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";

interface HandleLoginOptions {
  body: unknown;
  req: NextRequest;
  debug?: boolean;
}

// POST body for /api/auth/login
const loginBodySchema = z
  .object({
    credentials: emailCredentialsSchema,
    client_app_id: appIdSchema,
    code_challenge: PKCE_ProofKeyManager.codeChallengeSchema,
    challenge_time: z.number().nonnegative(),
  })
  .required({
    credentials: true,
    client_app_id: true,
    code_challenge: true,
    challenge_time: true,
  })
  .strict();

export async function handleLogin({
  body,
  req,
}: HandleLoginOptions): Promise<NextResponse> {
  const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(appEnv);

  const parse_login_body = await loginBodySchema.safeParseAsync(body);
  if (!parse_login_body.success) {
    return NextResponse.json(parse_login_body.error, { status: 400 });
  }
  const email_credentials = parse_login_body.data.credentials;
  const client_app_id = parse_login_body.data.client_app_id;
  const code_challenge: string = parse_login_body.data.code_challenge;
  const challenge_time: number = parse_login_body.data.challenge_time;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db, debug);
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
    console.error("Failed to query user: ", e);
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

  if (debug) {
    console.log(`Found user with email '${email_credentials.email}' in database`);
  }

  const uid: string = user.uid;

  let compare_password_matches: boolean = false;
  let compare_password_needs_upgrade: boolean = false;
  try {
    if (debug) {
      console.log(`Comparing password for user with uid: ${uid}`);
    }
    const compare_password_result = await userRegistry.comparePassword(
      uid,
      email_credentials.password,
    );
    compare_password_matches = compare_password_result.matches;
    compare_password_needs_upgrade = compare_password_result.needsUpgrade;
  } catch (e: unknown) {
    console.error("Failed to compare password: ", e);
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

  if (!compare_password_matches) {
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

  if (user.disabled) {
    console.warn(
      `[handleLogin] Blocked login for disabled account (uid: ${uid})`,
    );
    return NextResponse.json(
      {
        success: false,
        message: ERROR_MESSAGE_CATALOG.account_disabled,
      } satisfies AuthenticateResult,
      {
        status: 403,
      },
    );
  }

  // Lazy-upgrade legacy (v1) password hashes to the current (v2) per-user-salt
  // scheme now that we have verified the plaintext. Non-fatal: a failed
  // upgrade must not block the user's login. The next successful login will
  // retry the upgrade.
  if (compare_password_needs_upgrade) {
    try {
      await userRegistry.upgradePasswordHashIfNeeded(
        uid,
        email_credentials.password,
      );
    } catch (e: unknown) {
      console.error(
        "[handleLogin] Lazy password-hash upgrade failed (non-fatal):",
        e,
      );
    }
  }

  // Prevent signing in as a different user when an auth-server session already exists.
  // This guards against PKCE flow session mismatches (e.g. SSR check missed the existing session).
  const existingSession: UserData | false = await doesRequestHaveValidAuthServerRefreshToken(req);
  if (existingSession && existingSession.uid !== uid) {
    console.warn(
      `[handleLogin] Blocked login attempt: existing session uid '${existingSession.uid}' does not match target uid '${uid}'`,
    );
    return NextResponse.json(
      {
        success: false,
        message: "You are already signed in as a different user. Please log out first.",
      } satisfies AuthenticateResult,
      {
        status: 403,
      },
    );
  }

  if (debug) {
    console.log(`Login successful as ${email_credentials.email} (uid: ${uid})`);
  }

  let authorization_code: string;
  try {
    authorization_code = await userRegistry.generateAuthorizationCode(
      uid,
      client_app_id,
      code_challenge,
      "S256",
      challenge_time,
    );
  } catch (e: unknown) {
    console.error("Failed to generate authorization code: ", e);
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

  const response = NextResponse.json(
    {
      success: true,
      message: "Login successful",
      authorization_code,
    } satisfies AuthenticateResult,
    {
      status: 200,
    },
  );

  // Set auth-server refresh token cookie so the user is authenticated
  // for subsequent requests (e.g. the OAuth2 consent screen).
  // Wrapped in try/catch so login never fails due to cookie-setting errors.
  try {
    await setAuthServerRefreshTokenCookie({
      uid,
      db: dbh.db,
      req,
      res: response,
      environment: appEnv,
      debug,
    });
  } catch (e: unknown) {
    console.error("[handleLogin] Failed to set auth-server refresh token cookie (non-fatal):", e);
  }

  return response;
}

export default handleLogin