import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteApp, getApp } from "./operation";

// GET, DELETE /api/apps/{app_id}
export const { GET, DELETE } = apiRouteHandlers([getApp, deleteApp]);

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
