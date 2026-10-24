import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getAppApiScopePolicyOperation, updateAppApiScopePolicyOperation } from "./operation";

// GET, PUT /api/apis/{api_server_id}/connect_app/{client_app_id}/scopes
export const { GET, PUT } = apiRouteHandlers([
  getAppApiScopePolicyOperation,
  updateAppApiScopePolicyOperation,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
