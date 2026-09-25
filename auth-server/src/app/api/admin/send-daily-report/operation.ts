import { requireAuth, type OperationHandlerResult } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { DailyAdminReportFailure, DailyAdminReportResult } from "@/lib/api/domain-schemas/admin";
import type { GuardedOperationContext } from "@/lib/api/legacy-route-props";
import { adminErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import sendDailyReportHandler from "./sendDailyReportHandler";

export const DAILY_REPORT_ROUTE = "/api/admin/send-daily-report";

const AUTH_NOTES =
  "Scheduled jobs may call this without a session by sending the deployment's cron secret as `Authorization: Bearer <CRON_SECRET>`; that check runs before the session guard (see the route's cron bypass middleware). Every other caller needs an administrator session.";

const description =
  "Builds the last 24 hours' activity report (new users, organizations, captured errors, most active users, most popular apps and APIs) and e-mails it to the administrator mailing list. Both GET and POST trigger it so it can be wired to simple cron schedulers.";

/** Session-guarded path: an administrator triggered the report by hand. */
function runForAdministrator(ctx: GuardedOperationContext): OperationHandlerResult {
  const { dbh, redis } = ctx.context;
  return sendDailyReportHandler({ dbh, redis, uid: ctx.auth.user.uid });
}

const responses = {
  200: { description: "The report was generated and sent; the body counts what it contained", schema: DailyAdminReportResult },
  ...adminErrorResponses,
  500: { description: "The report could not be generated or sent (note the `ok: false` envelope)", schema: DailyAdminReportFailure },
} as const;

export const sendDailyReportViaGet = defineOperation({
  method: "get",
  path: DAILY_REPORT_ROUTE,
  summary: "Send the daily admin report",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});

export const sendDailyReportViaPost = defineOperation({
  method: "post",
  path: DAILY_REPORT_ROUTE,
  summary: "Send the daily admin report (POST)",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});
