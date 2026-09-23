import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { deleteErrorsBefore } from "@/lib/auth-db/errors";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/errors";

/** An ISO-8601 datetime or a non-negative integer ms epoch, as the query string carries it. */
const beforeParamSchema = z
  .string()
  .min(1)
  .pipe(z.union([z.coerce.number<string>().int().nonnegative(), z.iso.datetime()]))
  .openapi({
    description: "Cutoff: errors captured before this instant are deleted. An ISO-8601 datetime or a non-negative integer Unix epoch in milliseconds.",
    example: "2025-01-01T00:00:00Z",
  });

export const purgeErrorsBefore = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete captured errors before a cutoff",
  description:
    "Bulk-deletes rows of the captured server errors table older than the `before` cutoff. `resource_id` carries the number of deleted rows. A cutoff of `0` is valid and deletes nothing.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { query: z.object({ before: beforeParamSchema }) },
  responses: {
    200: { description: "The errors were deleted; `resource_id` is the deleted row count", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to delete errors", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { before } = ctx.query;

    // ms epoch of 0 (1970-01-01Z) is a semantically valid cutoff — it just
    // deletes nothing — so we accept any finite non-negative value here.
    const before_ms: number = typeof before === "number" ? before : new Date(before).getTime();
    if (!Number.isFinite(before_ms) || before_ms < 0) {
      return ctx.json(400, {
        success: false,
        message: "Invalid 'before' search parameter; could not derive a timestamp.",
      });
    }

    try {
      const deleted_count = await deleteErrorsBefore(db, before_ms);
      return ctx.json(200, {
        success: true,
        message: `Deleted ${deleted_count} error${deleted_count === 1 ? "" : "s"} captured before ${new Date(before_ms).toISOString()}.`,
        resource_id: String(deleted_count),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_errors_before_handler.deleteErrorsBefore",
        route: ROUTE,
        uid: user.uid,
        context: { before_ms },
      });
      return ctx.json(500, { success: false, message: "Failed to delete errors" });
    }
  },
});
