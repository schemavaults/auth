import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { configureCronSecretBypass } from "./cron-bypass";
import { sendDailyReportViaGet, sendDailyReportViaPost } from "./operation";

// GET, POST /api/admin/send-daily-report
export const { GET, POST } = apiRouteHandlers([sendDailyReportViaGet, sendDailyReportViaPost], {
  configure: configureCronSecretBypass,
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
