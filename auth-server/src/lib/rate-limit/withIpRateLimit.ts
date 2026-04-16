import "server-only";

import { NextResponse } from "next/server";
import type { RateLimitResult } from "./types";

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { success: false, message: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };
}

export function ipRequiredResponse(): NextResponse {
  return NextResponse.json(
    { success: false, message: "Unable to determine client IP address" },
    { status: 400 },
  );
}
