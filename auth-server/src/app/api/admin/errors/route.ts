import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { purgeErrorsBefore } from "./operation";

// DELETE /api/admin/errors
export const { DELETE } = apiRouteHandlers([purgeErrorsBefore]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
