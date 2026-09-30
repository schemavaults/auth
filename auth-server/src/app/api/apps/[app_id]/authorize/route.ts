import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { authorizeApp, revokeAppAuthorization } from "./operation";

// POST, DELETE /api/apps/{app_id}/authorize
export const { POST, DELETE } = apiRouteHandlers([authorizeApp, revokeAppAuthorization]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
