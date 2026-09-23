import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerDomainRef, apiServerParams } from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}/domains";

export const addApiServerDomain = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Add a domain to an API server",
  description:
    "Registers a domain for the API server in one app environment. The body's `api_server_id` must equal the path parameter. The same domain may be registered once per environment.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins of the owning organization, the owning user of a user-owned API server, or platform administrators.",
  }),
  request: {
    params: apiServerParams,
    body: {
      lenientContentType: true,
      schema: ApiServerDomainRef,
      description: "The domain to register; `api_server_id` must match the path.",
    },
  },
  responses: {
    200: {
      description: "The domain was added; `resource_id` is the API server id",
      schema: ResourceCreationResponse,
    },
    // 400: malformed body, or its api_server_id differs from the path
    ...validationErrorResponse,
    ...sessionErrorResponses,
    409: { description: "That domain is already registered for this environment", schema: ErrorResponse },
    500: { description: "Failed to add the domain", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { api_server_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/domains] POST request received`);
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);

    // Authorization: allow global admins, org owners/admins for API
    // servers belonging to their org, or the owning user of a user-owned
    // API server
    if (!user.admin) {
      let authorized = false;
      try {
        const apiServerData = await apiServerRegistry.getApiServer(api_server_id);
        if (apiServerData) {
          authorized = await canUserManageResource(db, user, apiServerData);
        }
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "POST_create_api_server_domain.checkOrgMembership",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id, nonFatal: true },
        });
      }
      if (!authorized) {
        return ctx.json(403, {
          success: false,
          message: "You must be an admin or organization owner to add a domain to an API server",
        });
      }
    }

    const newResource = ctx.body;
    if (newResource.api_server_id !== api_server_id) {
      console.error(new Error("API server ID in body does not match API server ID from route params!"));
      return ctx.json(400, {
        success: false,
        message: "Failed to parse new API server domain details from request body",
      });
    }

    try {
      await apiServerRegistry.addApiServerDomain(newResource.api_server_id, newResource);
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_api_server_domain.addApiServerDomain",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to add domain to API server" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully added domain to API server",
      resource_id: newResource.api_server_id,
    });
  },
});
