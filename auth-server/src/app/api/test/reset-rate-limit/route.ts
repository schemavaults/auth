// /api/test/reset-rate-limit
//
// Test-only endpoint that deletes all Redis rate-limit keys (keys matching "rl:*").
// This exists so that e2e tests do not hit 429 rate-limit responses while
// repeatedly calling login/register endpoints during a suite run.
//
// Returns 404 outside of the test environment.

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { RedisCache } from "@/lib/redis";

const notFoundBody = {
  error: true,
  success: false,
  message: "Route not available in this environment",
} as const;

async function deleteAllRateLimitKeys(): Promise<number> {
  await using redis = RedisCache.createConnection();
  let cursor = "0";
  let totalDeleted = 0;
  do {
    const [nextCursor, keys] = await redis.client.scan(
      cursor,
      "MATCH",
      "rl:*",
      "COUNT",
      500,
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      const deleted = await redis.client.del(...keys);
      totalDeleted += deleted;
    }
  } while (cursor !== "0");
  return totalDeleted;
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  void _req;
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment !== "test") {
    return NextResponse.json(notFoundBody, { status: 404 });
  }

  try {
    const deleted = await deleteAllRateLimitKeys();
    return NextResponse.json(
      {
        success: true,
        error: false,
        message: `Deleted ${deleted} rate-limit key(s)`,
        deleted,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    console.error("[/api/test/reset-rate-limit] Failed to reset rate limits:", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to reset rate limits",
      },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
