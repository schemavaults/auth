import { schemaVaultsAppDomainRefSchema } from "@schemavaults/app-definitions";
import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { appIdParams } from "@/lib/api/domain-schemas/apps";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apps/[app_id]/domains";

export const createAppDomain = defineOperation({
  method: "post",
  path: "/api/apps/{app_id}/domains",
  summary: "Add a domain to an app",
  description:
    "Registers a domain for a client application in one environment. Requires management access: platform administrators, owners / admins of the owning organization, or the owning user. The body's `app_id` must match the path.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams,
    body: {
      lenientContentType: true,
      schema: withOpenApi(schemaVaultsAppDomainRefSchema, "SchemaVaultsAppDomainRef"),
    },
  },
  responses: {
    200: { description: "The domain was added", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    409: { description: "The domain is already registered for this app and environment", schema: ErrorResponse },
    500: { description: "Failed to add the domain", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apps/${app_id}/domains] POST request received`);
    }

    let appRegistry: SchemaVaultsAppRegistry;
    try {
      appRegistry = new SchemaVaultsAppRegistry(db);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_create_app_domain.loadAppsRegistry",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to connect to app registry" });
    }

    // Authorization: allow global admins, org owners/admins for apps
    // belonging to their org, or the owning user of a user-owned app
    if (!user.admin) {
      let authorized = false;
      try {
        const appData = await appRegistry.getApp(app_id);
        if (appData) {
          authorized = await canUserManageResource(db, user, appData);
        }
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "POST_create_app_domain.checkOrgMembership",
          route: ROUTE,
          uid: user.uid,
          context: { app_id, nonFatal: true },
        });
      }

      if (!authorized) {
        return ctx.json(403, {
          success: false,
          message: "You must be an admin or organization owner to add a domain to an application",
        });
      }
    }

    const newResource = ctx.body;
    if (newResource.app_id !== app_id) {
      console.error(new Error("App ID in body does not match App ID from route params!"));
      return ctx.json(400, {
        success: false,
        message: "Failed to parse new frontend app details from request body",
      });
    }

    try {
      await appRegistry.addAppDomain(newResource.app_id, newResource);
      return ctx.json(200, {
        success: true,
        message: "Successfully added domain to app",
        resource_id: newResource.app_id,
      });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_app_domain.addAppDomain",
        route: ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to add domain to app" });
    }
  },
});
