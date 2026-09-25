import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listServerTraceOperations } from "./operation";

// GET /api/admin/server-traces/operations
export const { GET } = apiRouteHandlers([listServerTraceOperations]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
