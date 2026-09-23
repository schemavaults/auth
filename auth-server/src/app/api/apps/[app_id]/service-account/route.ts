import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createAppServiceAccount, deleteAppServiceAccount, getAppServiceAccount } from "./operation";

// GET, POST, DELETE /api/apps/{app_id}/service-account
export const { GET, POST, DELETE } = apiRouteHandlers([
  getAppServiceAccount,
  createAppServiceAccount,
  deleteAppServiceAccount,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
