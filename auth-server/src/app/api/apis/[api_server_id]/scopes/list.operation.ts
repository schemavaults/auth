import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ListApiServerScopesResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listApiServerScopes as listScopes } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { SCOPES_ROUTE, VIEW_SCOPES_AUTH_NOTES, loadApiServerForScopes } from "./scope-access";

export const listApiServerScopes = defineOperation({
  method: "get",
  path: SCOPES_ROUTE,
  summary: "List an API server's scopes",
  description:
    "Lists the API scopes the API server defines, oldest first. A client asks for them on an authorization request whose RFC 8707 `resource` names the API server (`GET /api/oidc/authorize?resource=...&scope=...`); the requested scopes the API server defines are granted on the access tokens minted for it. Hardcoded API servers define none.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: VIEW_SCOPES_AUTH_NOTES }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The API server's scopes", schema: ListApiServerScopesResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
    500: { description: "Failed to list the scopes", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    const access = await loadApiServerForScopes(db, user, api_server_id, "view");
    if (!access.ok) {
      if (access.status === 404) return ctx.json(404, { success: false, message: access.message });
      return ctx.json(403, { success: false, message: access.message });
    }

    try {
      const list = await listScopes(db, api_server_id);
      return ctx.json(200, { success: true, list });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_api_server_scopes",
        route: SCOPES_ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list the API server's scopes" });
    }
  },
});
