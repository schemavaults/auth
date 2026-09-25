import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { AppNotConnectedToApiServerError } from "@/lib/error/AppNotConnectedToApiServerError";
import { CONNECTION_AUTH_NOTES, ROUTE, connectionParams, loadConnectionResources } from "./connection-access";

export const disconnectAppFromApiServer = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Disconnect an app from an API server",
  description:
    "Revokes the client application's connection to the API server so it can no longer be issued access tokens for it. Responds 404 when the app was not connected.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: CONNECTION_AUTH_NOTES }),
  request: { params: connectionParams },
  responses: {
    200: { description: "The app was disconnected", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app, API server, or connection", schema: ErrorResponse },
    500: { description: "Failed to disconnect the app", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] DELETE request received`);
    }

    const access = await loadConnectionResources(db, user, api_server_id, client_app_id, {
      app: "You must own the app (organization owner or owning user) to disconnect it!",
      both: "You must own both the app and the API server (organization owner or owning user) to disconnect them!",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }

    const appsToApiPermissionsRegistry = new SchemaVaultsAppToApiPermissionsRegistry(db);
    try {
      await appsToApiPermissionsRegistry.revoke(client_app_id, api_server_id);
      return ctx.json(200, {
        success: true,
        message: "Successfully disconnected frontend application from API server",
      });
    } catch (e: unknown) {
      if (e instanceof AppNotConnectedToApiServerError) {
        return ctx.json(404, { success: false, message: "Connection does not exist" });
      }
      await captureServerException(db, e, {
        op_name: "DELETE_connect_app_to_api.revoke",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to disconnect app from API server" });
    }
  },
});
