import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createApp, listApps } from "./operation";

// GET, POST /api/apps
export const { GET, POST } = apiRouteHandlers([listApps, createApp]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
