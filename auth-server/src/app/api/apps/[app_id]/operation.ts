import {
  appIdSchema,
  isHardcodedAppId,
  schemaVaultsAppDefinitionSchema,
} from "@schemavaults/app-definitions";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { canUserViewResource, isUserOwnerOfResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apps/{app_id}";

const params = z.object({
  app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
});

export const getApp = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get a client application",
  description:
    "Loads one client application. Private apps are only visible to platform administrators, members of the owning organization, or the owning user.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params },
  responses: {
    200: {
      description: "The app",
      schema: z.object({ success: z.literal(true), app: schemaVaultsAppDefinitionSchema }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app", schema: ErrorResponse },
    500: { description: "Failed to load the app", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apps/${app_id}] GET request received`);
    }

    const apps = new SchemaVaultsAppRegistry(db);
    let app;
    try {
      app = await apps.getApp(app_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_app_handler.getApp",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load app" });
    }
    if (!app) return ctx.json(404, { success: false, message: "App not found" });

    if (!app.public && !user.admin) {
      // Organization members, the owning user of a user-owned app, or
      // global admins may view a private app.
      const authorized: boolean = await canUserViewResource(db, user, app);
      if (!authorized) {
        return ctx.json(403, { success: false, message: "You are not authorized to view this app" });
      }
    }
    return ctx.json(200, { success: true, app });
  },
});

export const deleteApp = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete a client application",
  description:
    "Organization owners, the owning user of a user-owned app, or platform administrators may delete an app (platform-owned apps: administrators only). Hardcoded apps cannot be deleted.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params },
  responses: {
    200: { description: "The app was deleted", schema: SuccessMessageResponse },
    400: { description: "The app could not be deleted", schema: ErrorResponse },
    ...sessionErrorResponses,
    404: { description: "No such app", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { app_id } = ctx.params;

    if (isHardcodedAppId(app_id)) {
      return ctx.json(403, { success: false, message: "Cannot delete a hardcoded app!" });
    }

    const registry = new SchemaVaultsAppRegistry(db);
    const app = await registry.getApp(app_id);
    if (!app) return ctx.json(404, { success: false, message: "App not found" });

    // Organization owners, the owning user of a user-owned app, or global
    // admins may delete an app (platform-owned apps: admins only).
    const isOwner: boolean = await isUserOwnerOfResource(db, user, app);
    if (!isOwner) {
      return ctx.json(403, {
        success: false,
        message:
          "Only the app's owner (organization owners, the owning user, or global admins) can delete apps",
      });
    }

    const result = await registry.deleteApp(app_id);
    if (!result.success) return ctx.json(400, { success: false, message: result.message });
    return ctx.json(200, { success: true, message: result.message });
  },
});
