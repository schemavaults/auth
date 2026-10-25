import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { syncResourceServerApiScopes } from "./operation";

// PUT /api/resource-server/apis/{api_server_id}/scopes
export const { PUT } = apiRouteHandlers([syncResourceServerApiScopes]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
