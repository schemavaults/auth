import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteApiServerScope, updateApiServerScope } from "./operation";

// PATCH, DELETE /api/apis/{api_server_id}/scopes/{api_server_scope_id}
export const { PATCH, DELETE } = apiRouteHandlers([updateApiServerScope, deleteApiServerScope]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
