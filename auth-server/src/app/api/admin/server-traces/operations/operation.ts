import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  AdminServerTraceOperation,
  serverTraceSinceParamSchema,
} from "@/lib/api/domain-schemas/admin";
import {
  adminErrorResponses,
  ErrorResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  listServerTraceOperations as listServerTraceOperationRows,
  type ServerTraceOperationRow,
} from "@/lib/auth-db/server-traces";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/server-traces/operations";

export const listServerTraceOperations = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List traced operations",
  description:
    "Returns every operation that recorded a server trace (optionally only since `since`) with its category and trace count, busiest first. Use the names to filter `GET /api/admin/server-traces`.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    query: z.object({ since: serverTraceSinceParamSchema.optional() }),
  },
  responses: {
    200: {
      description: "The traced operations",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ operations: z.array(AdminServerTraceOperation).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to list traced operations", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { since } = ctx.query;

    let rows: readonly ServerTraceOperationRow[];
    try {
      rows = await listServerTraceOperationRows(db, { since_ms: since });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_server_trace_operations_handler.listServerTraceOperations",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list traced operations!" });
    }

    const parsed = z.array(AdminServerTraceOperation).safeParse(rows);
    if (!parsed.success) {
      await captureServerException(db, parsed.error, {
        op_name: "GET_list_server_trace_operations_handler.parseOperations",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list traced operations!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed traced operations!",
      data: { operations: parsed.data },
    });
  },
});
