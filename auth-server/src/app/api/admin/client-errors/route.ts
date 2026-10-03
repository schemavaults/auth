import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listClientErrors, purgeClientErrorsBefore } from "./operation";

// GET, DELETE /api/admin/client-errors
export const { GET, DELETE } = apiRouteHandlers([listClientErrors, purgeClientErrorsBefore]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
