import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { handleOidcIntrospectPreflight } from "./introspect-handler";
import { postOidcIntrospect } from "./operation";

// POST, OPTIONS /api/oidc/introspect
export const { POST, OPTIONS } = apiRouteHandlers([postOidcIntrospect], {
  preflight: () => handleOidcIntrospectPreflight(),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
