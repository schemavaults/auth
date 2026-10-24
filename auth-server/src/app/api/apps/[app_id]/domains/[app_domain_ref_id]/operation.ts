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

const ROUTE = "/api/apps/[app_id]/domains/[app_domain_ref_id]";

export const deleteAppDomain = defineOperation({
  method: "delete",
  path: "/api/apps/{app_id}/domains/{app_domain_ref_id}",
  summary: "Remove a domain from an app",
  description:
    "Detaches a domain from a client application. Its origin is no longer accepted for CORS and, in environments without explicit callback URLs, as a `redirect_uri` origin. Requires management access: platform administrators, owners / admins of the owning organization, or the owning user. Hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams.extend({
      app_domain_ref_id: z.guid().openapi({ description: "The app domain reference id" }),
    }),
  },
  responses: {
    200: { description: "The domain was removed", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    404: {
      description: "No such app, or no domain with the given id for this app",
      schema: ErrorResponse,
    },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id, app_domain_ref_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: ROUTE,
      op_name: "DELETE_app_domain",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const deleted: boolean = await appRegistry.removeAppDomain(app_id, app_domain_ref_id);
      if (!deleted) {
        return ctx.json(404, {
          success: false,
          message: "No domain found with the given id for this app",
        });
      }
      return ctx.json(200, { success: true, message: "Domain removed from app" });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_app_domain.removeAppDomain",
        route: ROUTE,
        uid: user.uid,
        context: { app_id, app_domain_ref_id },
      });
      return ctx.json(500, { success: false, message: "Failed to remove domain from app" });
    }
  },
});
