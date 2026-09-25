import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { appIdParams, appManagementErrorResponses } from "@/lib/api/domain-schemas/apps";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { CLIENT_SECRET_ROUTE } from "./client-secret-route";

export const deleteClientSecret = defineOperation({
  method: "delete",
  path: "/api/apps/{app_id}/client-secret",
  summary: "Remove a client secret",
  description:
    "Removes the client secret of a client application, reverting it to a public client. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The client secret was removed", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    404: { description: "No such app, or the app has no client secret to remove", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: CLIENT_SECRET_ROUTE,
      op_name: "DELETE_client_secret",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const deleted: boolean = await appRegistry.deleteClientSecret(app_id);
      if (!deleted) {
        return ctx.json(404, { success: false, message: "This app has no client secret to remove" });
      }
      return ctx.json(200, {
        success: true,
        message: "Client secret removed. This app is now a public client again.",
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_client_secret.deleteClientSecret",
        route: CLIENT_SECRET_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to remove client secret" });
    }
  },
});
