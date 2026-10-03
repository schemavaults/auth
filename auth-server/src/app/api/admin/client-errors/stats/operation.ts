import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminClientErrorStats, clientErrorFilterQuerySchema } from "@/lib/api/domain-schemas/client-errors";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { getClientErrorStats, type ClientErrorStats, CLIENT_ERROR_STATS_TOP_N } from "@/lib/auth-db/client-errors";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/client-errors/stats";

export const getClientErrorSummaryStats = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Client error statistics",
  description:
    "Summary statistics of the client errors matching the filters (the same `since`, `client_app_id`, `fingerprint` and `q` as `GET /api/admin/client-errors`): totals (errors, distinct groups, apps and reported users, and the error count of the preceding window of the same length when `since` is given), " +
    `a timeline of error counts from \`since\` (or the oldest match) to now in at most 90 buckets, and the ${CLIENT_ERROR_STATS_TOP_N} busiest error groups, apps, SDK versions and operations.`,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { query: clientErrorFilterQuerySchema },
  responses: {
    200: {
      description: "Statistics of the matching client errors",
      schema: z.object({ success: z.literal(true), message: z.string(), data: AdminClientErrorStats }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to compute client error statistics", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { since, client_app_id, fingerprint, q } = ctx.query;

    let stats: ClientErrorStats;
    try {
      stats = await getClientErrorStats(db, { since_ms: since, client_app_id, fingerprint, q });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_client_error_stats_handler.getClientErrorStats",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to compute client error statistics!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully computed client error statistics!",
      data: stats,
    });
  },
});
