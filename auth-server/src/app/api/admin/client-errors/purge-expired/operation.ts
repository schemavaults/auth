import { ClientErrorRetentionPurgeResult } from "@/lib/api/domain-schemas/client-errors";
import { defineScheduledJobOperations } from "@/lib/api/scheduled-job-operations";
import { ErrorResponse } from "@/lib/api/schemas";
import { PURGE_EXPIRED_CLIENT_ERRORS_ROUTE, purgeExpiredClientErrorsHandler } from "./purge-handler";

const description =
  "Deletes the client error reports received more than `client_error_reports_retention_days` days ago (nothing when the setting is 0) and reports how many were deleted. " +
  "The intake and the `/admin/client-errors` dashboard also apply the retention period, at most hourly, while they are used; this job guarantees it when they are not.";

// GET: the scheduled job (cron secret only); POST: platform administrators (session only).
export const { viaGet: purgeExpiredClientErrorsViaGet, viaPost: purgeExpiredClientErrorsViaPost } =
  defineScheduledJobOperations({
    path: PURGE_EXPIRED_CLIENT_ERRORS_ROUTE,
    summary: "Apply the client error retention period",
    description,
    result: {
      description: "The expired reports were deleted; `data.deleted` counts them",
      schema: ClientErrorRetentionPurgeResult,
    },
    failure: { description: "The expired reports could not be deleted", schema: ErrorResponse },
    run: ({ context, uid }) =>
      purgeExpiredClientErrorsHandler({ db: context.db, redis: context.redis.client, uid }),
  });
