// /api/auth/login

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import handleLogin from "./handle_login";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { withServerTrace } from "@/lib/withServerTrace";
import { z } from "zod";
import { RedisCache } from "@/lib/redis";
import {
  extractClientIp,
  checkRateLimit,
  checkRateLimitCount,
  incrementRateLimitCounter,
  LOGIN_RATE_LIMIT,
  LOGIN_LOCKOUT,
  rateLimitResponse,
  ipRequiredResponse,
} from "@/lib/rate-limit";

const rateLimitEmailSchema = z
  .object({
    credentials: z.object({ email: z.string() }).passthrough(),
  })
  .passthrough();

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  // Ensure body is valid JSON
  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch (e: unknown) {
    if (environment === "development") {
      console.error(e);
    }
    return NextResponse.json(
      {
        success: false,
        message: "Invalid body JSON",
      } satisfies AuthenticateResult,
      {
        status: 400,
      },
    );
  }

  const ip = extractClientIp(req);
  if (!ip) {
    return ipRequiredResponse();
  }

  const emailParse = rateLimitEmailSchema.safeParse(body_json);
  const email: string | undefined = emailParse.success
    ? emailParse.data.credentials.email
    : undefined;

  if (email) {
    await using redis = RedisCache.createConnection();
    const identifiers = { ip, email };

    const lockout = await checkRateLimitCount(redis.client, LOGIN_LOCKOUT, identifiers);
    if (!lockout.allowed) {
      return rateLimitResponse(lockout);
    }

    const windowCheck = await checkRateLimit(redis.client, LOGIN_RATE_LIMIT, identifiers);
    if (!windowCheck.allowed) {
      return rateLimitResponse(windowCheck);
    }
  }

  try {
    const response = await withServerTrace({
      op_name: "POST /api/auth/login",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () => await handleLogin({ body: body_json, req }),
    });

    if (email && (response.status === 401 || response.status === 404)) {
      await using redis = RedisCache.createConnection();
      await incrementRateLimitCounter(redis.client, LOGIN_LOCKOUT, { ip, email });
    }

    return response;
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting to handle /api/auth/login request",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
