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
import { SERVICE_ACCOUNT_ROUTE } from "./service-account-summary";

export const deleteAppServiceAccount = defineOperation({
  method: "delete",
  path: "/api/apps/{app_id}/service-account",
  summary: "Remove an app's service account",
  description:
    "Removes the client application's service account. Its issued-token records go with it; the next client_credentials grant creates a fresh identity with a new uid. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The service account was removed", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    404: { description: "No such app, or the app has no service account to remove", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: SERVICE_ACCOUNT_ROUTE,
      op_name: "DELETE_service_account",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const deleted: boolean = await appRegistry.deleteServiceAccount(app_id);
      if (!deleted) {
        return ctx.json(404, { success: false, message: "This app has no service account to remove" });
      }
      return ctx.json(200, {
        success: true,
        message:
          "Service account removed. The next client credentials grant will create a new one with a different id.",
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_service_account.deleteServiceAccount",
        route: SERVICE_ACCOUNT_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to remove service account" });
    }
  },
});
