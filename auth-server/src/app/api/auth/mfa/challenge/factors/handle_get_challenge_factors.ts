import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type MfaChallengeFactorsResponse,
} from "@schemavaults/auth-common";
import { appIdSchema } from "@schemavaults/app-definitions";
import { ServerlessDatabase, MfaRegistry } from "@/lib/auth-db";
import { getChallenge } from "@/lib/mfa";
import { RedisCache } from "@/lib/redis";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/mfa/challenge/factors";

const querySchema = z
  .object({
    challenge_id: z.string().uuid(),
    client_app_id: appIdSchema,
  })
  .strict();

export async function handleGetChallengeFactors({
  req,
}: {
  req: NextRequest;
}): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    challenge_id: url.searchParams.get("challenge_id") ?? undefined,
    client_app_id: url.searchParams.get("client_app_id") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { challenge_id, client_app_id } = parsed.data;

  await using redis = RedisCache.createConnection();
  const challenge = await getChallenge(redis.client, challenge_id);
  if (!challenge) {
    // Match the verify endpoint's 410 semantics so the client can decide
    // to send the user back to /auth/login.
    return NextResponse.json(
      { success: false, message: "MFA challenge not found or expired" },
      { status: 410 },
    );
  }
  if (challenge.client_app_id !== client_app_id) {
    return NextResponse.json(
      {
        success: false,
        message: "Challenge does not match the requested client application.",
      },
      { status: 400 },
    );
  }

  await using dbh = ServerlessDatabase.createDBH();
  try {
    const mfaRegistry = new MfaRegistry(dbh.db);
    const [available_factors, recovery_codes_remaining] = await Promise.all([
      mfaRegistry.listVerifiedFactorsForUser(challenge.uid),
      mfaRegistry.countRecoveryCodesRemaining(challenge.uid),
    ]);
    const payload: MfaChallengeFactorsResponse = {
      available_factors,
      recovery_codes_available: recovery_codes_remaining > 0,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleGetChallengeFactors",
      route: ROUTE,
      uid: challenge.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to load MFA challenge factors" },
      { status: 500 },
    );
  }
}

export default handleGetChallengeFactors;
