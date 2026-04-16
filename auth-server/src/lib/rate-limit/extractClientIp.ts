import "server-only";

import type { NextRequest } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export function extractClientIp(req: NextRequest): string | null {
  const realIp = req.headers.get("X-Real-IP");
  if (realIp) {
    return realIp;
  }

  const forwardedFor = req.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development" || environment === "test") {
    return "127.0.0.1";
  }

  return null;
}
