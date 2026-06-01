import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import {
  mfaVerifyBodySchema,
  type AuthenticateResult,
} from "@schemavaults/auth-common";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import {
  ServerlessDatabase,
  UserRegistry,
  MfaRegistry,
} from "@/lib/auth-db";
import {
  consumeAttempt,
  deleteChallenge,
  getChallenge,
} from "@/lib/mfa";
import { evaluateMfaProof } from "./evaluate-proof";
import { RedisCache } from "@/lib/redis";
import setAuthServerRefreshTokenCookie from "@/lib/setAuthServerRefreshTokenCookie";
import captureServerException from "@/lib/captureServerException";
import shouldEnableDebug from "@/lib/should-enable-debug";

const ROUTE = "/api/auth/mfa/verify";

export async function handleMfaVerify({
  body,
  req,
}: {
  body: unknown;
  req: NextRequest;
}): Promise<NextResponse> {
  const env = getAppEnvironment();
  const debug = shouldEnableDebug(env);

  const parsed = await mfaVerifyBodySchema.safeParseAsync(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { challenge_id, client_app_id, proof } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  await using redis = RedisCache.createConnection();

  // Read challenge first; if missing, return 410 immediately.
  const challenge = await getChallenge(redis.client, challenge_id);
  if (!challenge) {
    return NextResponse.json(
      {
        kind: "challenge_expired",
        success: false,
        message: "MFA challenge not found or expired. Please log in again.",
      } satisfies AuthenticateResult,
      { status: 410 },
    );
  }

  if (challenge.client_app_id !== client_app_id) {
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Challenge does not match the requested client application.",
      } satisfies AuthenticateResult,
      { status: 400 },
    );
  }

  // Decrement attempts BEFORE evaluating the proof so a wrong code costs
  // an attempt regardless of which proof type the caller chose.
  const { remaining, existed } = await consumeAttempt(
    redis.client,
    challenge_id,
  );
  if (!existed) {
    return NextResponse.json(
      {
        kind: "challenge_expired",
        success: false,
        message: "MFA challenge not found or expired. Please log in again.",
      } satisfies AuthenticateResult,
      { status: 410 },
    );
  }

  const mfaRegistry = new MfaRegistry(dbh.db);

  let proofValid = false;
  try {
    proofValid = await evaluateMfaProof({
      mfaRegistry,
      uid: challenge.uid,
      proof,
      webauthnChallenge: challenge.webauthn_challenge ?? null,
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleMfaVerify.evaluateProof",
      route: ROUTE,
      uid: challenge.uid,
    });
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Failed to evaluate MFA proof. Please try again.",
      } satisfies AuthenticateResult,
      { status: 500 },
    );
  }

  if (!proofValid) {
    if (remaining === 0) {
      // Challenge already deleted by consumeAttempt — instruct client to restart.
      return NextResponse.json(
        {
          kind: "challenge_expired",
          success: false,
          message:
            "Too many incorrect attempts. Please log in again to start a new challenge.",
        } satisfies AuthenticateResult,
        { status: 410 },
      );
    }
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      } satisfies AuthenticateResult,
      { status: 401 },
    );
  }

  // Proof accepted: delete the challenge to prevent reuse, then issue
  // an authorization code via the same path login uses.
  await deleteChallenge(redis.client, challenge_id);

  let authorization_code: string;
  try {
    const userRegistry = new UserRegistry(dbh.db, debug);
    authorization_code = await userRegistry.generateAuthorizationCode(
      challenge.uid,
      challenge.client_app_id,
      challenge.code_challenge,
      "S256",
      challenge.challenge_time,
      challenge.redirect_uri ?? null,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleMfaVerify.generateAuthorizationCode",
      route: ROUTE,
      uid: challenge.uid,
    });
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Failed to generate authorization code",
      } satisfies AuthenticateResult,
      { status: 500 },
    );
  }

  const response = NextResponse.json(
    {
      kind: "authenticated",
      success: true,
      message: "Login successful",
      authorization_code,
    } satisfies AuthenticateResult,
    { status: 200 },
  );

  try {
    await setAuthServerRefreshTokenCookie({
      uid: challenge.uid,
      db: dbh.db,
      req,
      res: response,
      environment: env,
      debug,
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleMfaVerify.setAuthServerRefreshTokenCookie",
      route: ROUTE,
      uid: challenge.uid,
      context: { nonFatal: true },
    });
  }

  return response;
}

export default handleMfaVerify;
