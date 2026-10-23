import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createApiServerScope, listApiServerScopes } from "./operation";

// GET, POST /api/apis/{api_server_id}/scopes
export const { GET, POST } = apiRouteHandlers([listApiServerScopes, createApiServerScope]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
