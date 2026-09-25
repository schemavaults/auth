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
import { deleteErrorById } from "@/lib/auth-db/errors";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/errors/{error_id}";

export const deleteError = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete a captured error",
  description: "Removes one row of the captured server errors table.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ error_id: z.guid().openapi({ description: "Id of the captured error" }) }),
  },
  responses: {
    200: { description: "The error was deleted", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such error", schema: ErrorResponse },
    500: { description: "Failed to delete the error", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { error_id } = ctx.params;

    try {
      const deleted = await deleteErrorById(db, error_id);
      if (!deleted) return ctx.json(404, { success: false, message: "Error not found" });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_error_by_id_handler.deleteErrorById",
        route: "/api/admin/errors/[error_id]",
        uid: user.uid,
        context: { error_id },
      });
      return ctx.json(500, { success: false, message: "Failed to delete error" });
    }

    return ctx.json(200, { success: true, message: "Successfully deleted error", resource_id: error_id });
  },
});
