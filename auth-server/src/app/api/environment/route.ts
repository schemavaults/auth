import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getEnvironment } from "./operation";

// GET /api/environment
export const { GET } = apiRouteHandlers([getEnvironment]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
