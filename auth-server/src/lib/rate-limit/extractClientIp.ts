import "server-only";

import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

/** Accepts any request-like value (a `NextRequest`, a fetch `Request`, ...): only its headers are read. */
export function extractClientIp(req: { readonly headers: Headers }): string | null {
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
