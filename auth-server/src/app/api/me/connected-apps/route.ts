import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listMyConnectedApps } from "./operation";

// GET /api/me/connected-apps
export const { GET } = apiRouteHandlers([listMyConnectedApps]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
