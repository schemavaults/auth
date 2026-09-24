import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ListAppCallbackUrlsResponse, appIdParams } from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import { canUserViewResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apps/[app_id]/callback-urls";

export const listAppCallbackUrls = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/callback-urls",
  summary: "List an app's callback URLs",
  description:
    "Lists the explicit OAuth2 / OIDC callback (redirect) URLs registered for a client application. Visibility mirrors the domains listing: public apps, members of the owning organization, the owning user, and platform administrators.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The app's callback URLs", schema: ListAppCallbackUrlsResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app", schema: ErrorResponse },
    500: { description: "Failed to list the callback URLs", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { app_id } = ctx.params;
    const appRegistry = new SchemaVaultsAppRegistry(db);

    let app: SchemaVaultsApp | null;
    try {
      app = await appRegistry.getApp(app_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_app_callback_urls.getApp",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load app with given 'app_id'" });
    }
    if (!app) {
      return ctx.json(404, { success: false, message: "App not found" });
    }

    if (!app.public && !user.admin) {
      const authorized: boolean = await canUserViewResource(db, user, app);
      if (!authorized) {
        return ctx.json(403, {
          success: false,
          message: "You are not authorized to list callback URLs for this app",
        });
      }
    }

    try {
      const callback_urls = await appRegistry.getAppCallbackUrls(app_id);
      return ctx.json(200, {
        success: true,
        message: "Callback URLs successfully listed",
        list: callback_urls,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_app_callback_urls.getAppCallbackUrls",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list callback URLs for app" });
    }
  },
});
