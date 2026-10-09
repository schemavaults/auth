import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getAppIdConfig } from "./operation";

// GET /api/config/app-id
export const { GET } = apiRouteHandlers([getAppIdConfig]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
