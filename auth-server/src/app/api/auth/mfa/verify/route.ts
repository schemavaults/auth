// /api/auth/mfa/verify

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import handleMfaVerify from "./handle_mfa_verify";
import { withServerTrace } from "@/lib/withServerTrace";
import { RedisCache } from "@/lib/redis";
import {
  extractClientIp,
  checkRateLimit,
  MFA_VERIFY_RATE_LIMIT,
  rateLimitResponse,
  ipRequiredResponse,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch {
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Invalid body JSON",
      } satisfies AuthenticateResult,
      { status: 400 },
    );
  }

  try {
    return await withServerTrace({
      op_name: "POST /api/auth/mfa/verify",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () => await handleMfaVerify({ body: body_json, req }),
    });
  } catch (e: unknown) {
    console.error("Internal server error attempting /api/auth/mfa/verify", e);
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "Internal server error",
      } satisfies AuthenticateResult,
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
