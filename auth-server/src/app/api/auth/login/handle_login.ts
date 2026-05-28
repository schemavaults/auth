import "server-only";

import {
  ServerlessDatabase,
  UserRegistry,
  MfaRegistry,
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
import type {
  AuthenticateResult,
  AvailableMfaFactor,
} from "@schemavaults/auth-common";
import { appIdSchema, getAppEnvironment, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import setAuthServerRefreshTokenCookie from "@/lib/setAuthServerRefreshTokenCookie";
import { doesRequestHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import captureServerException from "@/lib/captureServerException";
import { RedisCache } from "@/lib/redis";
import { createChallenge } from "@/lib/mfa";
import { runDummyPasswordVerification } from "@/lib/hash_password";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";

// Constant message returned for both "no such user" and "wrong password"
// failures, so that an unauthenticated caller cannot tell whether an email
// is registered. Paired with a uniform 401 status code on both branches.
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

const ROUTE = "/api/auth/login";

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
    // OAuth2 `redirect_uri` to bind to the issued authorization code.
    // Required for third-party app flows; null/absent only for the auth
    // server's own /account flow (client_app_id === auth-server's own).
    redirect_uri: z.string().url().nullable().optional(),
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
  const redirect_uri: string | null = parse_login_body.data.redirect_uri ?? null;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // OAuth2 redirect_uri allowlist check. Refuse to mint a code if a
  // redirect_uri was supplied but is not registered for the requesting
  // client_app_id. For the auth server's own /account flow there is no
  // third-party redirect_uri to bind, so null is accepted only for the
  // hardcoded auth-server app_id.
  if (redirect_uri !== null) {
    const allowed = await isRedirectUriRegisteredForClientApp({
      redirect_uri,
      client_app_id,
      environment: appEnv,
      dbh,
    });
    if (!allowed) {
      return NextResponse.json(
        {
          kind: "failure",
          success: false,
          message: "redirect_uri is not registered for this client_app_id",
        } satisfies AuthenticateResult,
        { status: 400 },
      );
    }
  } else if (client_app_id !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "redirect_uri is required for this client_app_id",
      } satisfies AuthenticateResult,
      { status: 400 },
    );
  }

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db, debug);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.createUserRegistry",
      route: ROUTE,
    });
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
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.getUserByEmail",
      route: ROUTE,
    });
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Failed to query user",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  if (!user) {
    // Constant-time guard against email enumeration: do the same hashing
    // work a real password verification would do, then return the same
    // 401 with the same body as the "wrong password" branch below. The
    // result of the dummy verification is intentionally discarded.
    await runDummyPasswordVerification(email_credentials.password);
    console.error("[handleLogin] Invalid credentials (no such user)");
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: INVALID_CREDENTIALS_MESSAGE,
      } satisfies AuthenticateResult,
      {
        status: 401,
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
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.comparePassword",
      route: ROUTE,
      uid,
    });
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Failed to compare password",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  if (!compare_password_matches) {
    console.error("[handleLogin] Invalid credentials");
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: INVALID_CREDENTIALS_MESSAGE,
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
        kind: "failure",
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
      await captureServerException(dbh.db, e, {
        op_name: "handleLogin.upgradePasswordHashIfNeeded",
        route: ROUTE,
        uid,
        context: { nonFatal: true },
      });
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
        kind: "failure",
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

  // MFA gate: if the user has any verified factor, do NOT issue an
  // authorization code yet. Instead, persist a short-lived Redis
  // challenge keyed by a fresh UUID and return mfa_required. The client
  // exchanges the challenge_id at /api/auth/mfa/verify, where the same
  // generateAuthorizationCode call below is performed on success.
  // Fail closed: if we cannot determine MFA enrollment, reject the login.
  // Treating the lookup error as non-fatal would let a flaky query bypass MFA
  // for users who have a verified factor enrolled.
  let userHasMfa: boolean;
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    userHasMfa = await mfaRegistry.hasVerifiedFactor(uid);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.hasVerifiedFactor",
      route: ROUTE,
      uid,
    });
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Failed to verify MFA enrollment status",
      } satisfies AuthenticateResult,
      { status: 500 },
    );
  }

  if (userHasMfa) {
    try {
      const mfaRegistry = new MfaRegistry(dbh.db);
      const [verifiedFactors, recovery_codes_remaining] = await Promise.all([
        mfaRegistry.listVerifiedFactorsForUser(uid),
        mfaRegistry.countRecoveryCodesRemaining(uid),
      ]);
      // Map to the strict AvailableMfaFactor shape — the summary carries an
      // extra `verified_at` the client's strict schema would reject.
      const available_factors: AvailableMfaFactor[] = verifiedFactors.map(
        (factor) => ({
          factor_id: factor.factor_id,
          factor_type: factor.factor_type,
          last_used_at: factor.last_used_at,
        }),
      );
      const challenge_id = crypto.randomUUID();
      await using redis = RedisCache.createConnection();
      const { expires_at } = await createChallenge(redis.client, {
        challenge_id,
        uid,
        client_app_id,
        code_challenge,
        challenge_time,
        redirect_uri,
      });
      return NextResponse.json(
        {
          kind: "mfa_required",
          success: true,
          message: "MFA required",
          challenge_id,
          expires_at,
          available_factors,
          recovery_codes_available: recovery_codes_remaining > 0,
        } satisfies AuthenticateResult,
        { status: 200 },
      );
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "handleLogin.createMfaChallenge",
        route: ROUTE,
        uid,
      });
      return NextResponse.json(
        {
          kind: "failure",
          success: false,
          message: "Failed to create MFA challenge. Please try again.",
        } satisfies AuthenticateResult,
        { status: 500 },
      );
    }
  }

  let authorization_code: string;
  try {
    authorization_code = await userRegistry.generateAuthorizationCode(
      uid,
      client_app_id,
      code_challenge,
      "S256",
      challenge_time,
      redirect_uri,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.generateAuthorizationCode",
      route: ROUTE,
      uid,
      context: { client_app_id },
    });
    return NextResponse.json(
      {
        kind: "failure",
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
      kind: "authenticated",
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
    await captureServerException(dbh.db, e, {
      op_name: "handleLogin.setAuthServerRefreshTokenCookie",
      route: ROUTE,
      uid,
      context: { nonFatal: true },
    });
  }

  return response;
}

export default handleLogin