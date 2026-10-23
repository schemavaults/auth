import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ApiServerScopeResponse,
  UpdateApiServerScopeRequest,
  apiServerScopeParams,
} from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { updateApiServerScope as updateScope } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { MANAGE_SCOPES_AUTH_NOTES, SCOPE_ROUTE, loadApiServerForScopes } from "../scope-access";

export const updateApiServerScope = defineOperation({
  method: "patch",
  path: SCOPE_ROUTE,
  summary: "Update an API scope",
  description:
    "Changes the description shown to users for one of the API server's scopes and/or whether dynamically registered clients may be granted it (`allow_dynamic_clients`). The scope value is immutable: tokens already carry it, so renaming a scope means defining the new one and deleting the old one.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: MANAGE_SCOPES_AUTH_NOTES }),
  request: {
    params: apiServerScopeParams,
    body: { lenientContentType: true, schema: UpdateApiServerScopeRequest },
  },
  responses: {
    200: { description: "The updated scope", schema: ApiServerScopeResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server, or it defines no scope with that id", schema: ErrorResponse },
    500: { description: "Failed to update the scope", schema: ErrorResponse },
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
      const scope = await updateScope(db, api_server_id, api_server_scope_id, ctx.body);
      if (!scope) {
        return ctx.json(404, { success: false, message: "API scope not found" });
      }
      return ctx.json(200, { success: true, scope });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PATCH_update_api_server_scope",
        route: SCOPE_ROUTE,
        uid: user.uid,
        context: { api_server_id, api_server_scope_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the scope" });
    }
  },
});
