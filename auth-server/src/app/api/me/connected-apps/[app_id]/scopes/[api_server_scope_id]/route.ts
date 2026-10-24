import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { revokeMyAppScopeConsent } from "./operation";

// DELETE /api/me/connected-apps/{app_id}/scopes/{api_server_scope_id}
export const { DELETE } = apiRouteHandlers([revokeMyAppScopeConsent]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
