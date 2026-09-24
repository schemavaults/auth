import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { apiServerParams } from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { isUserOwnerOfResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}";

export const deleteApiServer = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete an API server",
  description:
    "Deletes an API server registration together with its domains, JWKS access keys and app connections. Hardcoded API servers cannot be deleted.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners of the owning organization, the owning user of a user-owned API server, or platform administrators (platform-owned API servers: administrators only).",
  }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The API server was deleted", schema: SuccessMessageResponse },
    // 400: malformed id, or the registry refused the deletion
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(403, { success: false, message: "Cannot delete a hardcoded API server!" });
    }

    const registry = new SchemaVaultsApiServerRegistry(db);
    const apiServer = await registry.getApiServer(api_server_id);
    if (!apiServer) {
      return ctx.json(404, { success: false, message: "API server not found" });
    }

    // Organization owners, the owning user of a user-owned API server, or
    // global admins may delete it (platform-owned API servers: admins only).
    const isOwner: boolean = await isUserOwnerOfResource(db, user, apiServer);
    if (!isOwner) {
      return ctx.json(403, {
        success: false,
        message:
          "Only the API server's owner (organization owners, the owning user, or global admins) can delete API servers",
      });
    }

    const result = await registry.deleteApiServer(api_server_id);
    if (!result.success) {
      return ctx.json(400, { success: false, message: result.message });
    }
    return ctx.json(200, { success: true, message: result.message });
  },
});
