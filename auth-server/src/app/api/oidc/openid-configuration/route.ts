import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOpenIdConfiguration } from "./operation";

// GET /api/oidc/openid-configuration. next.config.ts rewrites the spec-fixed
// discovery paths onto this route; the handler still receives the ORIGINAL
// request URL, so the well-known paths are registered as aliases here.
export const { GET } = apiRouteHandlers([getOpenIdConfiguration], {
  aliases: {
    "/.well-known/openid-configuration": getOpenIdConfiguration.path,
    "/.well-known/oauth-authorization-server": getOpenIdConfiguration.path,
  },
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
