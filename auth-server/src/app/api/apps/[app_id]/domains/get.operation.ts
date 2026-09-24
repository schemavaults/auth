import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ListAppDomainsResponse, appIdParams } from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { canUserViewResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apps/[app_id]/domains";

export const listAppDomains = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/domains",
  summary: "List an app's domains",
  description:
    "Lists the domains registered for a client application per environment. Private apps are only visible to platform administrators, members of the owning organization, or the owning user.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The app's domains", schema: ListAppDomainsResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app", schema: ErrorResponse },
    500: { description: "Failed to list the domains", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apps/${app_id}/domains] GET request received`);
    }

    let apps: SchemaVaultsAppRegistry;
    try {
      apps = new SchemaVaultsAppRegistry(db);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_app_domains.loadAppsRegistry",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to connect to apps registry" });
    }

    let app: SchemaVaultsApp;
    try {
      const loadAppQuery = await apps.getApp(app_id);
      if (!loadAppQuery) {
        throw new Error(`No app found with app_id ${app_id}`);
      }
      app = loadAppQuery;
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_app_domains.getApp",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(404, { success: false, message: "Failed to load app with given 'app_id'" });
    }

    if (!app.public && !user.admin) {
      const authorized: boolean = await canUserViewResource(db, user, app);
      if (!authorized) {
        console.error("Non-public apps are only visible to their owners!");
        return ctx.json(403, {
          success: false,
          message: "You are not authorized to list domains for this app",
        });
      }
    }

    try {
      const domains = await apps.getAppDomains(app_id);
      return ctx.json(200, { success: true, message: "Domains successfully listed", list: domains });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_app_domains.getAppDomains",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list domains for app" });
    }
  },
});
