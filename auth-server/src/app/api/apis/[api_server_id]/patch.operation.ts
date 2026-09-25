import { isHardcodedApiServerId, resourceUrlMatchModeSchema } from "@schemavaults/app-definitions";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}";

/**
 * Body of `PATCH /api/apis/{api_server_id}`: the API server's
 * dynamic-client policy (migration 00040). Both members are optional but
 * at least one must be present; nothing else about an API server is
 * updatable through this route. Mirrors
 * `apiServerDynamicClientPolicyUpdateSchema` in the client SDK.
 */
export const ApiServerDynamicClientPolicyUpdate = z
  .object({
    allow_dynamic_clients: z.boolean().optional().openapi({
      description:
        "Whether clients registered through RFC 7591 dynamic client registration may obtain access tokens for this API server (as an RFC 8707 `resource`) without an explicit app-to-API connection",
    }),
    resource_url_match_mode: resourceUrlMatchModeSchema.optional().openapi({
      description:
        "Whether an RFC 8707 `resource` URL must equal a registered domain (`exact`) or may be any URL under one (`prefix`)",
    }),
  })
  .strict()
  .refine(
    (body) => body.allow_dynamic_clients !== undefined || body.resource_url_match_mode !== undefined,
    "At least one of 'allow_dynamic_clients' or 'resource_url_match_mode' is required",
  )
  .openapi("ApiServerDynamicClientPolicyUpdate");

export const updateApiServerDynamicClientPolicy = defineOperation({
  method: "patch",
  path: ROUTE,
  summary: "Update an API server's dynamic-client policy",
  description:
    "Updates whether dynamically registered clients may request tokens for this API server as an RFC 8707 `resource`, and how a `resource` URL is matched against its registered domains. Nothing else about an API server is updatable here. Hardcoded API servers cannot be changed.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Organization owners/admins of the owning organization, the owning user, or platform administrators.",
  }),
  request: {
    params: apiServerParams,
    body: { lenientContentType: true, schema: ApiServerDynamicClientPolicyUpdate },
  },
  responses: {
    200: { description: "The updated API server", schema: ApiServerResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such API server", schema: ErrorResponse },
    500: { description: "Failed to update the API server", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id } = ctx.params;

    if (isHardcodedApiServerId(api_server_id)) {
      return ctx.json(403, { success: false, message: "Cannot update a hardcoded API server!" });
    }

    const registry = new SchemaVaultsApiServerRegistry(db);
    const apiServer = await registry.getApiServer(api_server_id);
    if (!apiServer) {
      return ctx.json(404, { success: false, message: "API server not found" });
    }

    const canManage: boolean = await canUserManageResource(db, user, apiServer);
    if (!canManage) {
      return ctx.json(403, {
        success: false,
        message:
          "Only the API server's managers (organization owners/admins, the owning user, or global admins) can change its dynamic-client policy",
      });
    }

    try {
      const updated = await registry.setApiServerDynamicClientPolicy(api_server_id, ctx.body);
      if (!updated) {
        return ctx.json(404, { success: false, message: "API server not found" });
      }
      return ctx.json(200, { success: true, api_server: updated });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PATCH_api_server_handler",
        route: ROUTE,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the API server" });
    }
  },
});
