// /api/auth/mfa/webauthn/options
//
// Unauthenticated, login-time endpoint. Given an in-flight MFA challenge,
// issues a WebAuthn assertion challenge (PublicKeyCredentialRequestOptionsJSON)
// for the challenge's user and attaches the nonce to the stored challenge so
// the subsequent /api/auth/mfa/verify call can validate the signed assertion.

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appIdSchema } from "@schemavaults/app-definitions";
import {
  webauthnAuthenticationOptionsResponseSchema,
  type WebauthnAuthenticationOptionsResponse,
} from "@schemavaults/auth-common";
import { ServerlessDatabase, MfaRegistry } from "@/lib/auth-db";
import { RedisCache } from "@/lib/redis";
import {
  getChallenge,
  setWebauthnChallenge,
  generateWebauthnAuthenticationOptions,
} from "@/lib/mfa";
import {
  extractClientIp,
  checkRateLimit,
  MFA_VERIFY_RATE_LIMIT,
  rateLimitResponse,
  ipRequiredResponse,
} from "@/lib/rate-limit";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/mfa/webauthn/options";

const bodySchema = z
  .object({
    challenge_id: z.string().uuid(),
    client_app_id: appIdSchema,
  })
  .strict();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = extractClientIp(req);
  if (!ip) return ipRequiredResponse();

  await using redis = RedisCache.createConnection();
  {
    const result = await checkRateLimit(redis.client, MFA_VERIFY_RATE_LIMIT, {
      ip,
    });
    if (!result.allowed) return rateLimitResponse(result);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(parsed.error, { status: 400 });
  }
  const { challenge_id, client_app_id } = parsed.data;

  await using dbh = ServerlessDatabase.createDBH();

  try {
    const challenge = await getChallenge(redis.client, challenge_id);
    if (!challenge) {
      return NextResponse.json(
        { success: false, message: "MFA challenge not found or expired" },
        { status: 410 },
      );
    }
    if (challenge.client_app_id !== client_app_id) {
      return NextResponse.json(
        { success: false, message: "Challenge does not match client app" },
        { status: 400 },
      );
    }

    const mfaRegistry = new MfaRegistry(dbh.db);
    const verified = (
      await mfaRegistry.listWebauthnCredentialsForUser(challenge.uid)
    ).filter((c) => c.verified);
    if (verified.length === 0) {
      return NextResponse.json(
        { success: false, message: "No passkeys enrolled" },
        { status: 409 },
      );
    }

    const options = await generateWebauthnAuthenticationOptions({
      allowCredentials: verified.map((c) => ({
        credential_id: c.credential_id,
        transports: c.transports,
      })),
    });

    const attached = await setWebauthnChallenge(
      redis.client,
      challenge_id,
      options.challenge,
    );
    if (!attached) {
      return NextResponse.json(
        { success: false, message: "MFA challenge not found or expired" },
        { status: 410 },
      );
    }

    const payload: WebauthnAuthenticationOptionsResponse = {
      options: options as unknown as Record<string, unknown>,
    };
    const result =
      webauthnAuthenticationOptionsResponseSchema.safeParse(payload);
    if (!result.success) {
      await captureServerException(dbh.db, result.error, {
        op_name: "POST /api/auth/mfa/webauthn/options:response_schema_mismatch",
        route: ROUTE,
        uid: challenge.uid,
      });
      return NextResponse.json(
        { success: false, message: "Failed to start passkey challenge" },
        { status: 500 },
      );
    }
    return NextResponse.json(result.data, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST /api/auth/mfa/webauthn/options",
      route: ROUTE,
    });
    return NextResponse.json(
      { success: false, message: "Failed to start passkey challenge" },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
