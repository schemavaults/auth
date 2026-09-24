import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { authorizeApp } from "./operation";

// POST /api/apps/{app_id}/authorize
export const { POST } = apiRouteHandlers([authorizeApp]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
