import { requireAuth, type OperationHandlerResult } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ClientErrorRetentionPurgeResult } from "@/lib/api/domain-schemas/client-errors";
import type { GuardedOperationContext } from "@/lib/api/legacy-route-props";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { PURGE_EXPIRED_CLIENT_ERRORS_ROUTE, purgeExpiredClientErrorsHandler } from "./purge-handler";

const AUTH_NOTES =
  "Scheduled jobs call this without a session by sending the deployment's cron secret as `Authorization: Bearer <CRON_SECRET>`; that check runs before the session guard (see the route's cron bypass middleware). Every other caller needs an administrator session.";

const description =
  "Deletes the client error reports received more than `client_error_reports_retention_days` days ago (nothing when the setting is 0) and reports how many were deleted. " +
  "The intake and the `/admin/client-errors` dashboard also apply the retention period, at most hourly, while they are used; this scheduled job (a daily Vercel cron, or a host crontab entry for the `deploy/` stack) guarantees it when they are not. Both GET and POST run it so simple cron schedulers can call it.";

/** Session-guarded path: an administrator triggered the purge by hand. */
function runForAdministrator(ctx: GuardedOperationContext): OperationHandlerResult {
  return purgeExpiredClientErrorsHandler({
    db: ctx.context.db,
    redis: ctx.context.redis.client,
    uid: ctx.auth.user.uid,
  });
}

const responses = {
  200: { description: "The expired reports were deleted; `data.deleted` counts them", schema: ClientErrorRetentionPurgeResult },
  ...adminErrorResponses,
  500: { description: "The expired reports could not be deleted", schema: ErrorResponse },
} as const;

export const purgeExpiredClientErrorsViaGet = defineOperation({
  method: "get",
  path: PURGE_EXPIRED_CLIENT_ERRORS_ROUTE,
  summary: "Apply the client error retention period",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});

export const purgeExpiredClientErrorsViaPost = defineOperation({
  method: "post",
  path: PURGE_EXPIRED_CLIENT_ERRORS_ROUTE,
  summary: "Apply the client error retention period (POST)",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});
