import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { postOidcToken } from "./operation";
import { handleOidcTokenPreflight } from "./token-request";

// POST, OPTIONS /api/oidc/token
export const { POST, OPTIONS } = apiRouteHandlers([postOidcToken], {
  preflight: (request) => handleOidcTokenPreflight(request),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
