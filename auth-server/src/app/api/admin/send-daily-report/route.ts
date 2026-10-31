import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { sendDailyReportViaGet, sendDailyReportViaPost } from "./operation";

// GET  /api/admin/send-daily-report — the scheduled job (cron secret only)
// POST /api/admin/send-daily-report — platform administrators (session only)
export const { GET, POST } = apiRouteHandlers([sendDailyReportViaGet, sendDailyReportViaPost]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
