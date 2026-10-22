import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ApiServerScopeResponse,
  CreateApiServerScopeRequest,
  apiServerParams,
} from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { createApiServerScope as createScope } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { MANAGE_SCOPES_AUTH_NOTES, SCOPES_ROUTE, loadApiServerForScopes } from "./scope-access";

export const createApiServerScope = defineOperation({
  method: "post",
  path: SCOPES_ROUTE,
  summary: "Define a scope on an API server",
  description:
    "Defines an API scope on the API server, e.g. `notes:read`. From then on an authorization request whose RFC 8707 `resource` names the API server may ask for it, and the access tokens minted for the API server carry it in their `scope` claim, where the API server's route guards enforce it (`requiredScopes` / `required_scopes`). An API server defines at most 100 scopes. Hardcoded API servers cannot define scopes.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: MANAGE_SCOPES_AUTH_NOTES }),
  request: {
    params: apiServerParams,
    body: { lenientContentType: true, schema: CreateApiServerScopeRequest },
  },
  responses: {
    200: { description: "The new scope", schema: ApiServerScopeResponse },
    // 400: malformed body (an invalid or reserved scope value), or a hardcoded API server
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
    409: {
      description: "The API server already defines that scope, or already defines 100 scopes",
      schema: ErrorResponse,
    },
    500: { description: "Failed to define the scope", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    const access = await loadApiServerForScopes(db, user, api_server_id, "manage");
    if (!access.ok) {
      if (access.status === 404) return ctx.json(404, { success: false, message: access.message });
      if (access.status === 400) return ctx.json(400, { success: false, message: access.message });
      return ctx.json(403, { success: false, message: access.message });
    }

    try {
      const scope = await createScope(db, {
        api_server_id,
        scope: ctx.body.scope,
        description: ctx.body.description,
        created_by: user.uid,
      });
      return ctx.json(200, { success: true, scope });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_api_server_scope",
        route: SCOPES_ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to define the scope" });
    }
  },
});
