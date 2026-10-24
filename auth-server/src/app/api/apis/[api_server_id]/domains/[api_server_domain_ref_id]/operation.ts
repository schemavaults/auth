import { isHardcodedApiServerId, type SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { apiServerDomainParams } from "@/lib/api/domain-schemas/apis";
import {
  ErrorResponse,
  SuccessMessageResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}/domains/{api_server_domain_ref_id}";

export const deleteApiServerDomain = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Remove a domain from an API server",
  description:
    "Detaches a domain from an API server: RFC 8707 `resource` URLs on it no longer resolve to the API server. Hardcoded API servers take their domains from the server's environment and cannot be configured.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins of the owning organization, the owning user of a user-owned API server, or platform administrators.",
  }),
  request: { params: apiServerDomainParams },
  responses: {
    200: { description: "The domain was removed", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: {
      description: "No such API server, or no domain with the given id for this API server",
      schema: ErrorResponse,
    },
    500: { description: "Failed to remove the domain", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { api_server_id, api_server_domain_ref_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/domains/${api_server_domain_ref_id}] DELETE request received`);
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);

    let apiServer: SchemaVaultsApiServerDefinition | null;
    try {
      apiServer = await apiServerRegistry.getApiServer(api_server_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_api_server_domain.getApiServer",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load API server" });
    }
    if (!apiServer) {
      return ctx.json(404, { success: false, message: "API server not found" });
    }

    // Authorization: allow global admins, org owners/admins for API
    // servers belonging to their org, or the owning user of a user-owned
    // API server (the same gate as adding a domain)
    if (!user.admin) {
      let authorized = false;
      try {
        authorized = await canUserManageResource(db, user, apiServer);
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "DELETE_api_server_domain.canUserManageResource",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id, nonFatal: true },
        });
      }
      if (!authorized) {
        return ctx.json(403, {
          success: false,
          message: "You must be an admin or organization owner to remove a domain from an API server",
        });
      }
    }

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(403, {
        success: false,
        message: "The domains of hardcoded API servers cannot be removed",
      });
    }

    try {
      const deleted: boolean = await apiServerRegistry.removeApiServerDomain(
        api_server_id,
        api_server_domain_ref_id,
      );
      if (!deleted) {
        return ctx.json(404, {
          success: false,
          message: "No domain found with the given id for this API server",
        });
      }
      return ctx.json(200, { success: true, message: "Domain removed from API server" });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_api_server_domain.removeApiServerDomain",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, api_server_domain_ref_id },
      });
      return ctx.json(500, { success: false, message: "Failed to remove domain from API server" });
    }
  },
});
