import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { apiServerScopeParams } from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  SuccessMessageResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { deleteApiServerScope as deleteScope } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { MANAGE_SCOPES_AUTH_NOTES, SCOPE_ROUTE, loadApiServerForScopes } from "../scope-access";

export const deleteApiServerScope = defineOperation({
  method: "delete",
  path: SCOPE_ROUTE,
  summary: "Delete an API scope",
  description:
    "Deletes one of the API server's scopes. It is no longer granted, and refresh grants stop carrying it forward; access tokens already issued with it keep it until they expire.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: MANAGE_SCOPES_AUTH_NOTES }),
  request: { params: apiServerScopeParams },
  responses: {
    200: { description: "The scope was deleted", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server, or it defines no scope with that id", schema: ErrorResponse },
    500: { description: "Failed to delete the scope", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id, api_server_scope_id } = ctx.params;

    const access = await loadApiServerForScopes(db, user, api_server_id, "manage");
    if (!access.ok) {
      if (access.status === 404) return ctx.json(404, { success: false, message: access.message });
      if (access.status === 400) return ctx.json(400, { success: false, message: access.message });
      return ctx.json(403, { success: false, message: access.message });
    }

    try {
      const deleted = await deleteScope(db, api_server_id, api_server_scope_id);
      if (!deleted) {
        return ctx.json(404, { success: false, message: "API scope not found" });
      }
      return ctx.json(200, { success: true, message: "API scope deleted" });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_api_server_scope",
        route: SCOPE_ROUTE,
        uid: user.uid,
        context: { api_server_id, api_server_scope_id },
      });
      return ctx.json(500, { success: false, message: "Failed to delete the scope" });
    }
  },
});
