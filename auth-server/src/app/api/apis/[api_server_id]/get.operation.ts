import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { canUserViewResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}";

export const getApiServer = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get an API server",
  description:
    "Loads one API server registration. Private (not publicly listed) API servers are only visible to platform administrators, members of the owning organization, or the owning user.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The API server", schema: ApiServerResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
    500: { description: "Failed to load the API server", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { api_server_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}] GET request received`);
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
    let apiServer: SchemaVaultsApiServerDefinition | null;
    try {
      apiServer = await apiServerRegistry.getApiServer(api_server_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_api_server_handler.getApiServer",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load API server" });
    }

    if (!apiServer) {
      return ctx.json(404, { success: false, message: "API server not found" });
    }

    if (!apiServer.public && !user.admin) {
      // Organization members, the owning user of a user-owned API server,
      // or global admins may view a private API server.
      const authorized: boolean = await canUserViewResource(db, user, apiServer);
      if (!authorized) {
        return ctx.json(403, { success: false, message: "You are not authorized to view this API server" });
      }
    }

    return ctx.json(200, { success: true, api_server: apiServer });
  },
});
