import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { handleOidcRevokePreflight } from "./cors";
import { postOidcRevoke } from "./operation";

// POST, OPTIONS /api/oidc/revoke
export const { POST, OPTIONS } = apiRouteHandlers([postOidcRevoke], {
  preflight: () => handleOidcRevokePreflight(),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
