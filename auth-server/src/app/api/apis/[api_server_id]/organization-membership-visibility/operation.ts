import { isHardcodedApiServerId, organizationMembershipVisibilitySchema } from "@schemavaults/app-definitions";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/{api_server_id}/organization-membership-visibility";

/** Body of `PUT /api/apis/{api_server_id}/organization-membership-visibility`. */
export const ApiServerOrganizationMembershipVisibilityUpdate = z
  .object({
    organization_membership_visibility: withOpenApi(organizationMembershipVisibilitySchema, {
      description:
        "`owning_organization`: the API server may look up memberships of its own organization only (the default). `all_organizations`: it may look up a user's memberships in any organization, but only while presenting that user's access token for the API server.",
      example: "all_organizations",
    }),
  })
  .strict()
  .openapi("ApiServerOrganizationMembershipVisibilityUpdate");

export const setApiServerOrganizationMembershipVisibility = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Set an API server's organization membership visibility",
  description:
    "Sets which organizations' memberships the API server may look up on the resource-server endpoints (`GET /api/resource-server/organizations/{organization_id}/members/{uid}/role` and `GET /api/resource-server/users/{uid}/organizations`). By default an API server only sees its owning organization; `all_organizations` is meant for multi-tenant platform services that serve every organization, and lookups outside the owning organization must carry the user's access token for the API server in `X-Subject-Token`. Platform administrators only: the API server's own managers cannot widen it. Hardcoded API servers cannot be changed.",
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: apiServerParams,
    body: { lenientContentType: true, schema: ApiServerOrganizationMembershipVisibilityUpdate },
  },
  responses: {
    200: { description: "The updated API server", schema: ApiServerResponse },
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: {
      description: "The caller is not a platform administrator, or the API server is hardcoded",
      schema: ErrorResponse,
    },
    404: { description: "No such API server", schema: ErrorResponse },
    500: { description: "Failed to update the API server", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(403, { success: false, message: "Cannot update a hardcoded API server!" });
    }

    const registry = new SchemaVaultsApiServerRegistry(db);
    try {
      const existing = await registry.getApiServer(api_server_id);
      if (!existing) {
        return ctx.json(404, { success: false, message: "API server not found" });
      }
      const updated = await registry.setApiServerOrganizationMembershipVisibility(
        api_server_id,
        ctx.body.organization_membership_visibility,
      );
      if (!updated) {
        return ctx.json(404, { success: false, message: "API server not found" });
      }
      return ctx.json(200, { success: true, api_server: updated });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PUT_api_server_organization_membership_visibility_handler",
        route: ROUTE,
        uid: ctx.auth.user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the API server" });
    }
  },
});
