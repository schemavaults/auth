import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ApiServerResponse, apiServerParams } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}/delegated-token-policy";

/** Body of `PUT /api/apis/{api_server_id}/delegated-token-policy`. */
export const ApiServerDelegatedTokenPolicyUpdate = z
  .object({
    accept_delegated_tokens: z.boolean().openapi({
      description:
        "Whether the API server accepts delegated access tokens: tokens whose RFC 8693 actor (`act`) claim names someone acting on behalf of the user, e.g. a client app's agent. Turn it on only once the resource server runs `@schemavaults/auth-server-sdk` 0.39.0 or later (`@schemavaults/jwt` 0.16.0+): older versions reject any token carrying `act`.",
      example: true,
    }),
  })
  .strict()
  .openapi("ApiServerDelegatedTokenPolicyUpdate");

export const setApiServerDelegatedTokenPolicy = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Set an API server's delegated-token policy",
  description:
    "Sets whether the API server accepts delegated access tokens, whose RFC 8693 actor (`act`) claim names someone acting on behalf of the token's user (e.g. a client app's agent; the token's subject is still the user). The auth server mints a delegated token only for a registered API server that accepts them; every API server starts without. Resource servers see the actor as `actor` on route guards and principals and as `act` in introspection responses, and decide per operation what an actor may do. Hardcoded API servers cannot be changed and never accept delegated tokens.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Organization owners/admins of the owning organization, the owning user, or platform administrators.",
  }),
  request: {
    params: apiServerParams,
    body: { lenientContentType: true, schema: ApiServerDelegatedTokenPolicyUpdate },
  },
  responses: {
    200: { description: "The updated API server", schema: ApiServerResponse },
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: {
      description: "The caller cannot manage the API server, or the API server is hardcoded",
      schema: ErrorResponse,
    },
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
    try {
      const existing = await registry.getApiServer(api_server_id);
      if (!existing) {
        return ctx.json(404, { success: false, message: "API server not found" });
      }
      if (!(await canUserManageResource(db, user, existing))) {
        return ctx.json(403, {
          success: false,
          message:
            "Only the API server's managers (organization owners/admins, the owning user, or global admins) can change its delegated-token policy",
        });
      }
      const updated = await registry.setApiServerDelegatedTokenPolicy(
        api_server_id,
        ctx.body.accept_delegated_tokens,
      );
      if (!updated) {
        return ctx.json(404, { success: false, message: "API server not found" });
      }
      return ctx.json(200, { success: true, api_server: updated });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PUT_api_server_delegated_token_policy_handler",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the API server" });
    }
  },
});
