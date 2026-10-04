import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminClientError } from "@/lib/api/domain-schemas/client-errors";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { deleteClientErrorById, getClientErrorById, type ClientErrorRow } from "@/lib/auth-db/client-errors";
import captureServerException from "@/lib/captureServerException";
import { forgetStoredClientErrorBytes } from "@/lib/client-errors/intake-policy";

const ROUTE = "/api/admin/client-errors/{client_error_id}";

const params = z.object({
  client_error_id: z.guid().openapi({ description: "Id of the client error report" }),
});

export const getClientError = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get a client error",
  description: "Returns one client error report with its stack trace and context.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { params },
  responses: {
    200: {
      description: "The client error",
      schema: z.object({ success: z.literal(true), message: z.string(), data: AdminClientError }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such client error", schema: ErrorResponse },
    500: { description: "Failed to load the client error", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { client_error_id } = ctx.params;

    let row: ClientErrorRow | null;
    try {
      row = await getClientErrorById(db, client_error_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_client_error_by_id_handler.getClientErrorById",
        route: "/api/admin/client-errors/[client_error_id]",
        uid: user.uid,
        context: { client_error_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load client error" });
    }
    if (!row) return ctx.json(404, { success: false, message: "Client error not found" });

    return ctx.json(200, { success: true, message: "Successfully loaded client error", data: row });
  },
});

export const deleteClientError = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete a client error",
  description: "Removes one client error report.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { params },
  responses: {
    200: { description: "The client error was deleted", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such client error", schema: ErrorResponse },
    500: { description: "Failed to delete the client error", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { client_error_id } = ctx.params;

    try {
      const deleted = await deleteClientErrorById(db, client_error_id);
      if (!deleted) return ctx.json(404, { success: false, message: "Client error not found" });
      await forgetStoredClientErrorBytes(ctx.context.redis.client);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_client_error_by_id_handler.deleteClientErrorById",
        route: "/api/admin/client-errors/[client_error_id]",
        uid: user.uid,
        context: { client_error_id },
      });
      return ctx.json(500, { success: false, message: "Failed to delete client error" });
    }

    return ctx.json(200, { success: true, message: "Successfully deleted client error", resource_id: client_error_id });
  },
});
