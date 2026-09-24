import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { checkAppAuthorization } from "./operation";

// GET /api/apps/{app_id}/check-authorization
export const { GET } = apiRouteHandlers([checkAppAuthorization]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
