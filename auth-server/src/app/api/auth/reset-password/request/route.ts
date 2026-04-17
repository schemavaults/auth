// /api/auth/reset-password/request

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import handleResetPasswordRequest from "./handle_reset_password_request";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { withServerTrace } from "@/lib/withServerTrace";
import { z } from "zod";
import { RedisCache } from "@/lib/redis";
import {
  checkRateLimit,
  RESET_PASSWORD_REQUEST_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";

const rateLimitEmailSchema = z
  .object({ email: z.string() })
  .passthrough();

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch (e: unknown) {
    if (environment === "development") {
      console.error(e);
    }
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }

  const emailParse = rateLimitEmailSchema.safeParse(body_json);
  if (emailParse.success) {
    await using redis = RedisCache.createConnection();
    const result = await checkRateLimit(
      redis.client,
      RESET_PASSWORD_REQUEST_RATE_LIMIT,
      { ip: "", email: emailParse.data.email },
    );
    if (!result.allowed) {
      return rateLimitResponse(result);
    }
  }

  try {
    return await withServerTrace({
      op_name: "POST /api/auth/reset-password/request",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () => await handleResetPasswordRequest({ body: body_json, req }),
    });
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting to handle /api/auth/reset-password/request",
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
