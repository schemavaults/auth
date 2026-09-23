import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getResourceServerAllowedOrigins } from "./operation";

// GET /api/resource-server/apis/{api_server_id}/allowed-origins
export const { GET } = apiRouteHandlers([getResourceServerAllowedOrigins]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
