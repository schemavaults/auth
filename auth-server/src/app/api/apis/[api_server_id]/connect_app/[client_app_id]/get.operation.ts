import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { CONNECTION_AUTH_NOTES, ROUTE, connectionParams, loadConnectionResources } from "./connection-access";

export const AppToApiServerConnectionResponse = z
  .object({
    success: z.literal(true),
    is_allowed: z.boolean().openapi({
      description: "Whether the client application is connected to (may request tokens for) the API server",
    }),
  })
  .openapi("AppToApiServerConnectionResponse");

export const getAppToApiServerConnection = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Check whether an app is connected to an API server",
  description:
    "Reports whether the client application is connected to the API server, i.e. may be issued access tokens with the API server as audience.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: CONNECTION_AUTH_NOTES }),
  request: { params: connectionParams },
  responses: {
    200: { description: "The connection status", schema: AppToApiServerConnectionResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app or API server", schema: ErrorResponse },
    500: { description: "Failed to check the connection", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] GET request received`);
    }

    // Authorization: same ownership checks as POST
    const access = await loadConnectionResources(db, user, api_server_id, client_app_id, {
      app: "You must own the app (organization owner or owning user) to check this permission for it!",
      both: "You must own both the app and the API server (organization owner or owning user) to check this permission for them!",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }

    try {
      const permissionsRegistry = new SchemaVaultsAppToApiPermissionsRegistry(db);
      const is_allowed = await permissionsRegistry.isAllowed(client_app_id, api_server_id);
      return ctx.json(200, { success: true, is_allowed });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_app_to_api_permission_handler.isAllowed",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to check app-to-api permission" });
    }
  },
});
