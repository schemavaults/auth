import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteApiServer, getApiServer, updateApiServerDynamicClientPolicy } from "./operation";

// GET, PATCH, DELETE /api/apis/{api_server_id}
export const { GET, PATCH, DELETE } = apiRouteHandlers([
  getApiServer,
  updateApiServerDynamicClientPolicy,
  deleteApiServer,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
