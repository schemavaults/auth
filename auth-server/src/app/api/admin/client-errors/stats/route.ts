import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getClientErrorSummaryStats } from "./operation";

// GET /api/admin/client-errors/stats
export const { GET } = apiRouteHandlers([getClientErrorSummaryStats]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
