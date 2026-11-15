import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listMyAuditLog } from "./operation";

// GET /api/me/audit-log
export const { GET } = apiRouteHandlers([listMyAuditLog]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
