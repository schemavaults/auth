import { DailyAdminReportFailure, DailyAdminReportResult } from "@/lib/api/domain-schemas/admin";
import { defineScheduledJobOperations } from "@/lib/api/scheduled-job-operations";
import sendDailyReportHandler from "./sendDailyReportHandler";

export const DAILY_REPORT_ROUTE = "/api/admin/send-daily-report";

const description =
  "Builds the last 24 hours' activity report (new users, organizations, organization MFA enforcement, captured server errors, summary statistics of the client error reports received, most active users, most popular apps and APIs, with links into the admin console) and e-mails it to the administrator mailing list.";

// GET: the scheduled job (cron secret only); POST: platform administrators (session only).
export const { viaGet: sendDailyReportViaGet, viaPost: sendDailyReportViaPost } = defineScheduledJobOperations({
  path: DAILY_REPORT_ROUTE,
  summary: "Send the daily admin report",
  description,
  result: {
    description: "The report was generated and sent; the body counts what it contained",
    schema: DailyAdminReportResult,
  },
  failure: {
    description: "The report could not be generated or sent (note the `ok: false` envelope)",
    schema: DailyAdminReportFailure,
  },
  run: ({ context, uid }) => sendDailyReportHandler({ dbh: context.dbh, redis: context.redis, uid }),
});
