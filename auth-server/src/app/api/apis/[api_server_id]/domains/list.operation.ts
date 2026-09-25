import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ListApiServerDomainsResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import hasUserAccessToApiServer from "@/lib/isUserInApiOwnerOrganization";

const ROUTE = "/api/apis/{api_server_id}/domains";

export const listApiServerDomains = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List an API server's domains",
  description: "Lists the domains registered for an API server across app environments.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Members (any role) of the owning organization, the owning user of a user-owned API server, or platform administrators.",
  }),
  request: { params: apiServerParams },
  responses: {
    200: { description: "The API server's domains", schema: ListApiServerDomainsResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
    500: { description: "Failed to list the domains", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { api_server_id } = ctx.params;
    if (environment === "development") {
      console.log(`[/api/apis/${api_server_id}/domains] GET request received`);
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
    const apiServer = await apiServerRegistry.getApiServer(api_server_id);
    if (!apiServer) {
      return ctx.json(404, {
        success: false,
        message: "Failed to load API server with given 'api_server_id'",
      });
    }

    if (!user.admin) {
      let authorized = false;
      try {
        authorized = await hasUserAccessToApiServer(user, api_server_id, db, ["owner", "admin", "member"]);
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "GET_list_api_server_domains.hasUserAccessToApiServer",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id, nonFatal: true },
        });
      }
      if (!authorized) {
        return ctx.json(403, {
          success: false,
          message: "You are not authorized to list domains for this API server",
        });
      }
    }

    try {
      const domains = await apiServerRegistry.getApiServerDomains(api_server_id);
      return ctx.json(200, { success: true, message: "Domains successfully listed", list: domains });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_api_server_domains.getApiServerDomains",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list domains for API server" });
    }
  },
});
