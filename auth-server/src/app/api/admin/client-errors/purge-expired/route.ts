import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { purgeExpiredClientErrorsViaGet, purgeExpiredClientErrorsViaPost } from "./operation";

// GET  /api/admin/client-errors/purge-expired — the scheduled job (cron secret only)
// POST /api/admin/client-errors/purge-expired — platform administrators (session only)
export const { GET, POST } = apiRouteHandlers([purgeExpiredClientErrorsViaGet, purgeExpiredClientErrorsViaPost]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
