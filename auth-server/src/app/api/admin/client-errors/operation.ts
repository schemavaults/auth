import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminClientError, clientErrorPageQuerySchema } from "@/lib/api/domain-schemas/client-errors";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  deleteClientErrorsBefore,
  listClientErrors as listClientErrorRows,
  type ClientErrorsPage,
} from "@/lib/auth-db/client-errors";
import captureServerException from "@/lib/captureServerException";
import { forgetStoredClientErrorBytes } from "@/lib/client-errors/intake-policy";
import { CLIENT_ERRORS_DEFAULT_LIMIT } from "@/lib/client-errors/client-error-page-filters";

const ROUTE = "/api/admin/client-errors";

export const listClientErrors = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List client errors",
  description:
    "Returns one page of the errors client applications reported (`POST /api/client-errors/{client_app_id}`), newest first, with the number of errors matching the filters. " +
    "`since`, `client_app_id`, `fingerprint` and `q` narrow the listing; `limit` and `offset` page through it. Summary statistics are at `GET /api/admin/client-errors/stats`.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { query: clientErrorPageQuerySchema },
  responses: {
    200: {
      description: "The page of matching client errors",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({
          errors: z.array(AdminClientError),
          total: z.number().int().nonnegative().openapi({ description: "Errors matching the filters, across pages" }),
          limit: z.number().int().positive(),
          offset: z.number().int().nonnegative(),
        }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to list client errors", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { since, client_app_id, fingerprint, q } = ctx.query;
    const limit: number = ctx.query.limit ?? CLIENT_ERRORS_DEFAULT_LIMIT;
    const offset: number = ctx.query.offset ?? 0;

    let page: ClientErrorsPage;
    try {
      page = await listClientErrorRows(db, { since_ms: since, client_app_id, fingerprint, q, limit, offset });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_client_errors_handler.listClientErrors",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list client errors!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed client errors!",
      data: { errors: page.errors, total: page.total, limit, offset },
    });
  },
});

/** An ISO-8601 datetime or a non-negative integer ms epoch, as the query string carries it. */
const beforeParamSchema = z
  .string()
  .min(1)
  .pipe(z.union([z.coerce.number<string>().int().nonnegative(), z.iso.datetime()]))
  .openapi({
    description:
      "Cutoff: client errors received before this instant are deleted. An ISO-8601 datetime or a non-negative integer Unix epoch in milliseconds.",
    example: "2025-01-01T00:00:00Z",
  });

export const purgeClientErrorsBefore = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete client errors before a cutoff",
  description:
    "Bulk-deletes the client errors received before the `before` cutoff. `resource_id` carries the number of deleted rows. A cutoff of `0` is valid and deletes nothing.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { query: z.object({ before: beforeParamSchema }) },
  responses: {
    200: { description: "The client errors were deleted; `resource_id` is the deleted row count", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to delete client errors", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { before } = ctx.query;

    const before_ms: number = typeof before === "number" ? before : new Date(before).getTime();
    if (!Number.isFinite(before_ms) || before_ms < 0) {
      return ctx.json(400, {
        success: false,
        message: "Invalid 'before' search parameter; could not derive a timestamp.",
      });
    }

    try {
      const deleted_count = await deleteClientErrorsBefore(db, before_ms);
      if (deleted_count > 0) await forgetStoredClientErrorBytes(ctx.context.redis.client);
      return ctx.json(200, {
        success: true,
        message: `Deleted ${deleted_count} client error${deleted_count === 1 ? "" : "s"} received before ${new Date(before_ms).toISOString()}.`,
        resource_id: String(deleted_count),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_client_errors_before_handler.deleteClientErrorsBefore",
        route: ROUTE,
        uid: user.uid,
        context: { before_ms },
      });
      return ctx.json(500, { success: false, message: "Failed to delete client errors" });
    }
  },
});
