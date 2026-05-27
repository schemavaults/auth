// /api/auth/mfa/challenge/factors

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import handleGetChallengeFactors from "./handle_get_challenge_factors";
import { withServerTrace } from "@/lib/withServerTrace";
import { RedisCache } from "@/lib/redis";
import {
  extractClientIp,
  checkRateLimit,
  MFA_VERIFY_RATE_LIMIT,
  rateLimitResponse,
  ipRequiredResponse,
} from "@/lib/rate-limit";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = extractClientIp(req);
  if (!ip) return ipRequiredResponse();

  {
    await using redis = RedisCache.createConnection();
    const result = await checkRateLimit(redis.client, MFA_VERIFY_RATE_LIMIT, {
      ip,
    });
    if (!result.allowed) {
      return rateLimitResponse(result);
    }
  }

  try {
    return await withServerTrace({
      op_name: "GET /api/auth/mfa/challenge/factors",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () => await handleGetChallengeFactors({ req }),
    });
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting /api/auth/mfa/challenge/factors",
      e,
    );
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
