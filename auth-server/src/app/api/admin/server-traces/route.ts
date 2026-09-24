import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listServerTraces } from "./operation";

// GET /api/admin/server-traces
export const { GET } = apiRouteHandlers([listServerTraces]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
