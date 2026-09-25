import { schemaVaultsAppCallbackUrlRefSchema } from "@schemavaults/app-definitions";
import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { appIdParams, appManagementErrorResponses } from "@/lib/api/domain-schemas/apps";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import loadAppForManagement from "@/lib/load-app-for-management";

const ROUTE = "/api/apps/[app_id]/callback-urls";

export const createAppCallbackUrl = defineOperation({
  method: "post",
  path: "/api/apps/{app_id}/callback-urls",
  summary: "Add a callback URL to an app",
  description:
    "Registers an explicit callback URL for a client application in one environment. Once at least one callback URL exists for an app + environment, `redirect_uri` validation for that environment requires an exact match against the registered list (instead of any path on a registered domain). Requires management access; hardcoded apps cannot be configured. The body's `app_id` must match the path.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams,
    body: {
      lenientContentType: true,
      schema: withOpenApi(schemaVaultsAppCallbackUrlRefSchema, "SchemaVaultsAppCallbackUrlRef"),
    },
  },
  responses: {
    200: { description: "The callback URL was added", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    409: { description: "The callback URL is already registered for this app and environment", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: ROUTE,
      op_name: "POST_create_app_callback_url",
    });
    if (!guard.ok) return guard.response;

    const newResource = ctx.body;
    if (newResource.app_id !== app_id) {
      console.error(new Error("App ID in body does not match App ID from route params!"));
      return ctx.json(400, {
        success: false,
        message: "Failed to parse new callback URL details from request body",
      });
    }

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      await appRegistry.addAppCallbackUrl(app_id, newResource);
      return ctx.json(200, {
        success: true,
        message: "Successfully added callback URL to app",
        resource_id: newResource.app_callback_url_ref_id,
      });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_app_callback_url.addAppCallbackUrl",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to add callback URL to app" });
    }
  },
});
