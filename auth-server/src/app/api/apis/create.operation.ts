import type { ResourceOwnership } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerDefinition } from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { resolveRequestedOwnershipForCreation } from "@/lib/ownership/requested-ownership";

const ROUTE = "/api/apis";

export const createApiServer = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Register an API server",
  description:
    "Registers a new API server (resource server). The body's ownership fields decide who owns it: platform (administrators only), an organization the caller owns/administers, or the caller's own account (when user-owned resources are enabled). `hardcoded` must be false; `created_at`/`created_by` are set by the server.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Platform-owned API servers: administrators only. Organization-owned: organization owners/admins. User-owned: any user when the `allow_user_owned_resource_creation` setting is on.",
  }),
  request: {
    body: {
      lenientContentType: true,
      schema: ApiServerDefinition,
      description: "The API server to register; `hardcoded` must be `false`.",
    },
  },
  responses: {
    200: { description: "The API server was registered", schema: ResourceCreationResponse },
    // 400: the body failed validation, declares a hardcoded API server, or names an invalid owner
    ...validationErrorResponse,
    ...sessionErrorResponses,
    409: { description: "An API server with that id already exists", schema: ErrorResponse },
    500: { description: "Failed to register the API server", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis, environment } = ctx.context;
    if (environment === "development") {
      console.log("[/api/apis] POST request received");
    }

    const newResource = ctx.body;
    // Hardcoded API server definitions may not be dynamically created at this endpoint.
    if (typeof newResource.hardcoded !== "boolean" || newResource.hardcoded) {
      return ctx.json(400, {
        success: false,
        message: "Failed to parse new API server details from request body",
      });
    }

    // Who will own the new API server (platform / organization / user),
    // and is the caller allowed to create API servers for that owner?
    let ownership: ResourceOwnership;
    try {
      const resolved = await resolveRequestedOwnershipForCreation(db, user, newResource, redis.client);
      if (!resolved.ok) {
        return ctx.json(resolved.status, { success: false, message: resolved.message });
      }
      ownership = resolved.ownership;
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_api_creation_handler.resolveRequestedOwnership",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id: newResource.api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to resolve who should own the new API server" });
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
    try {
      await apiServerRegistry.registerApiServer({
        api_server_id: newResource.api_server_id,
        api_server_name: newResource.api_server_name,
        api_server_description: newResource.api_server_description,
        publicly_listed: newResource.public satisfies boolean,
        ownership,
        created_by: user.uid,
      });
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_api_creation_handler.registerApiServer",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id: newResource.api_server_id, ownership },
      });
      return ctx.json(500, { success: false, message: "Failed to create new API server" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully created new API server",
      resource_id: newResource.api_server_id,
    });
  },
});
