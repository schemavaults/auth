import {
  apiServerIdSchema,
  schemaVaultsAppEnvironmentSchema,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { jwksAccessAssertionScheme } from "@/lib/api/auth-schemes";
import {
  jwksAssertionErrorResponses,
  ResourceServerErrorResponse,
} from "@/lib/api/domain-schemas/resource-servers";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db/apis/app-to-api-permissions-registry";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { getAppAllowedOriginsForEnvironment } from "@/lib/cors/cors-for-client-app";

const ROUTE = "/api/resource-server/apis/{api_server_id}/allowed-origins";

export const ResourceServerAllowedOriginsResponse = z
  .object({
    success: z.literal(true),
    data: z.object({
      api_server_id: apiServerIdSchema,
      environment: withOpenApi(schemaVaultsAppEnvironmentSchema, {
        description: "The app environment whose client app domains were collected",
      }),
      origins: z
        .array(z.string().openapi({ example: "https://app.example.com" }))
        .readonly()
        .openapi({ description: "Sorted, de-duplicated origins" }),
    }),
  })
  .openapi("ResourceServerAllowedOriginsResponse");

/**
 * List the origins allowed to make cross-origin requests to a resource
 * server: the union of the environment-scoped domains of every client app
 * connected to the given API server.
 */
export const getResourceServerAllowedOrigins = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List a resource server's allowed CORS origins",
  description:
    "Returns the origins a resource server should accept cross-origin requests from: the union of the domains, in this deployment's app environment, of every client application connected to the API server. The response is sent with `Cache-Control: no-store`. Resource servers built on `@schemavaults/auth-server-sdk` call this through `RemoteAllowedOriginsResolver`.",
  tags: [API_TAGS.resourceServers],
  auth: requireAuth({
    schemes: [jwksAccessAssertionScheme],
    notes:
      "The assertion's `iss` / `sub` must equal the `api_server_id` path parameter, so a resource server can only query its own allowed origins. Every assertion is accepted once.",
  }),
  request: {
    params: z.object({
      api_server_id: withOpenApi(apiServerIdSchema, {
        description: "API server id; must equal the assertion's issuer",
        example: "my-resource-api",
      }),
    }),
  },
  responses: {
    200: { description: "The allowed origins", schema: ResourceServerAllowedOriginsResponse },
    ...jwksAssertionErrorResponses,
    500: { description: "Failed to collect the origins", schema: ResourceServerErrorResponse },
  },
  handler: async (ctx) => {
    const { db, dbh, environment } = ctx.context;
    // The resolver verified the assertion for this very id (ctx.auth.clientId).
    const api_server_id: ApiServerId = ctx.params.api_server_id;

    // The resolver already refuses the auth server's own id; kept as a
    // second line of defence.
    if (api_server_id === getAuthServerAppId()) {
      return ctx.json(400, {
        success: false,
        error: "The auth server does not export allowed origins via this endpoint",
      });
    }

    try {
      const registry = new SchemaVaultsAppToApiPermissionsRegistry(db);
      const connectedApps = await registry.listConnectedApps(api_server_id);

      const origins = new Set<string>();
      for (const { client_app_id } of connectedApps) {
        const appOrigins = await getAppAllowedOriginsForEnvironment(client_app_id, environment, dbh);
        for (const origin of appOrigins) {
          origins.add(origin);
        }
      }

      return ctx.json(
        200,
        {
          success: true,
          data: {
            api_server_id,
            environment,
            origins: [...origins].sort(),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "resource-server-allowed-origins.listOrigins",
        route: "/api/resource-server/apis/[api_server_id]/allowed-origins",
        context: { api_server_id, environment },
      });
      return ctx.json(500, { success: false, error: "Internal server error" });
    }
  },
});
