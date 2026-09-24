import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { connectAppToApiServer, disconnectAppFromApiServer, getAppToApiServerConnection } from "./operation";

// GET, POST, DELETE /api/apis/{api_server_id}/connect_app/{client_app_id}
export const { GET, POST, DELETE } = apiRouteHandlers([
  getAppToApiServerConnection,
  connectAppToApiServer,
  disconnectAppFromApiServer,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
