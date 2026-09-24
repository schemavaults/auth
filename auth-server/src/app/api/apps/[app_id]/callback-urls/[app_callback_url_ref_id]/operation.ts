import { z, requireAuth } from "@schemavaults/openapi-operations";
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

const ROUTE = "/api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]";

export const deleteAppCallbackUrl = defineOperation({
  method: "delete",
  path: "/api/apps/{app_id}/callback-urls/{app_callback_url_ref_id}",
  summary: "Remove a callback URL from an app",
  description:
    "Removes a callback URL from a client application's explicit allowlist. When the last one for an environment is removed, `redirect_uri` validation for that environment falls back to origin matching against the app's domains. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams.extend({
      app_callback_url_ref_id: z.guid().openapi({ description: "The callback URL reference id" }),
    }),
  },
  responses: {
    200: { description: "The callback URL was removed", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    404: {
      description: "No such app, or no callback URL with the given id for this app",
      schema: ErrorResponse,
    },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, dbh } = ctx.context;
    const { app_id, app_callback_url_ref_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: ROUTE,
      op_name: "DELETE_app_callback_url",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const deleted: boolean = await appRegistry.removeAppCallbackUrl(app_id, app_callback_url_ref_id);
      if (!deleted) {
        return ctx.json(404, {
          success: false,
          message: "No callback URL found with the given id for this app",
        });
      }
      return ctx.json(200, { success: true, message: "Callback URL removed from app" });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_app_callback_url.removeAppCallbackUrl",
        route: ROUTE,
        uid: user.uid,
        context: { app_id, app_callback_url_ref_id },
      });
      return ctx.json(500, { success: false, message: "Failed to remove callback URL from app" });
    }
  },
});
