import {
  appToApiPermissionSchema,
  isHardcodedApiServerId,
  type AppToApiPermission,
} from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import { appToHardcodedApiPermissionSchema } from "@/lib/auth-db/apis/apps-to-hardcoded-apis-permissions-table";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { CONNECTION_AUTH_NOTES, ROUTE, connectionParams, loadConnectionResources } from "./connection-access";

export const connectAppToApiServer = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Connect an app to an API server",
  description:
    "Allows the client application to be issued access tokens for the API server. Responds 409 when the app is already connected (the client SDK maps it to `AppAlreadyConnectedToApiServerError`). No request body.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, notes: CONNECTION_AUTH_NOTES }),
  request: { params: connectionParams },
  responses: {
    200: {
      description: "The app was connected; `resource_id` is the API server id",
      schema: ResourceCreationResponse,
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app or API server", schema: ErrorResponse },
    409: { description: "The app is already connected to the API server", schema: ErrorResponse },
    500: { description: "Failed to connect the app", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] POST request received`);
    }

    const access = await loadConnectionResources(db, user, api_server_id, client_app_id, {
      app: "You must own the app (organization owner or owning user) to connect it!",
      both: "You must own both the app and the API server (organization owner or owning user) to connect them!",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }

    // PERMISSION HAS BEEN VALIDATED IF THIS POINT REACHED
    if (environment === "development") {
      console.log(
        `[/api/apis/${api_server_id}/connect_app/${client_app_id}] User has permission to connect app to api!`,
      );
    }

    let newPermission: AppToApiPermission;
    try {
      const schema = isHardcodedApiServerId(api_server_id)
        ? appToHardcodedApiPermissionSchema
        : appToApiPermissionSchema;
      const parsed = await schema.safeParseAsync({ api_server_id, client_app_id, created_at: Date.now() });
      if (!parsed.success) throw parsed.error;
      newPermission = parsed.data;
    } catch (e: unknown) {
      console.error(e);
      return ctx.json(400, {
        success: false,
        message: "Failed to parse which app to connect to which API server",
      });
    }

    const appsToApiPermissionsRegistry = new SchemaVaultsAppToApiPermissionsRegistry(db);
    try {
      await appsToApiPermissionsRegistry.allow(newPermission.client_app_id, newPermission.api_server_id);
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_connect_app_to_api.allow",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to connect app to API server" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully conected frontend application to API server",
      resource_id: newPermission.api_server_id,
    });
  },
});
