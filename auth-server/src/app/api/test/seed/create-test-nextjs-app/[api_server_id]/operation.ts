import { apiServerIdSchema, platformOwnership, type ApiServerId } from "@schemavaults/app-definitions";
import { sign_verify_alg } from "@schemavaults/jwt";
import { z, publicAccess, withOpenApi } from "@schemavaults/openapi-operations";
import { randomUUID } from "node:crypto";
import { defineOperation } from "@/lib/api/context";
import {
  TEST_ENVIRONMENT_ONLY_NOTE,
  TestEnvironmentAcknowledgement,
  TestEnvironmentErrorResponse,
} from "@/lib/api/domain-schemas/test-environment";
import { validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  SchemaVaultsApiServerRegistry,
  SchemaVaultsAppRegistry,
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { hashClientSecret } from "@/lib/oauth2/client-secret";
import { CreateTestNextjsAppRequest } from "./request-schema";

/**
 * Seeds the app + API server pair the example Next.js resource server
 * (`tests/example-nextjs-resource-server`) logs in through: both share the
 * `api_server_id`, are platform-owned, connected to each other, reachable
 * at `url` in the test environment, and the API server's active JWKS
 * access key is the given public key.
 */
export const createTestNextjsApp = defineOperation({
  method: "post",
  path: "/api/test/seed/create-test-nextjs-app/{api_server_id}",
  summary: "Seed the example resource server's app and API",
  description:
    "Registers a client application and an API server sharing the given id (both platform-owned and connected to each other), adds `url` as their test-environment domain, stores `jwks_access_public_key` as the API server's active JWKS access key and, optionally, a client secret, an explicit callback URL allowlist, extra API server connections and the API server's dynamic-client policy. The Cypress suite calls this once before running against the example Next.js resource server.",
  tags: [API_TAGS.testEnvironment],
  auth: publicAccess(TEST_ENVIRONMENT_ONLY_NOTE),
  request: {
    params: z.object({
      api_server_id: withOpenApi(apiServerIdSchema, {
        description: "Id used for both the seeded app and the seeded API server",
        example: "example-resource-server",
      }),
    }),
    body: { lenientContentType: true, schema: CreateTestNextjsAppRequest },
  },
  responses: {
    200: { description: "The app and API server were seeded", schema: TestEnvironmentAcknowledgement },
    ...validationErrorResponse,
    404: {
      description: "The auth server does not run in the `test` app environment",
      schema: TestEnvironmentErrorResponse,
    },
    500: { description: "Seeding failed", schema: TestEnvironmentErrorResponse },
  },
  handler: async (ctx) => {
    const { db, environment } = ctx.context;
    if (environment !== "test") {
      return ctx.json(404, {
        message: "Not available in this environment",
        error: true,
        success: false,
      });
    }

    const api_server_id: ApiServerId = ctx.params.api_server_id;
    const {
      url,
      jwks_access_public_key,
      client_secret,
      callback_urls,
      connect_to_api_server_ids,
      allow_dynamic_clients,
      resource_url_match_mode,
    } = ctx.body;

    const now: number = Date.now();

    const appRegistry = new SchemaVaultsAppRegistry(db);
    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
    const appToApiRegistry = new SchemaVaultsAppToApiPermissionsRegistry(db);
    const jwksRegistry = new JwksAccessKeysRegistry(db);

    try {
      await appRegistry.registerApp({
        app_id: api_server_id,
        app_name: "Example Frontend App",
        app_description: "App created in seeding for test",
        publicly_listed: false,
        ownership: platformOwnership(),
        web: true,
      });
      await appRegistry.addAppDomain(api_server_id, {
        app_id: api_server_id,
        app_domain_ref_id: api_server_id,
        created_at: now,
        hardcoded: false,
        environment,
        domain: url,
      });
      await apiServerRegistry.registerApiServer({
        api_server_id,
        api_server_name: "Example Backend API",
        api_server_description: "API created in seeding for test",
        publicly_listed: false,
        ownership: platformOwnership(),
      });
      await apiServerRegistry.addApiServerDomain(api_server_id, {
        api_server_id,
        api_server_domain_ref_id: api_server_id,
        created_at: now,
        hardcoded: false,
        environment,
        domain: url,
      });
      await appToApiRegistry.allow(api_server_id, api_server_id, null);

      if (allow_dynamic_clients !== undefined || resource_url_match_mode !== undefined) {
        await apiServerRegistry.setApiServerDynamicClientPolicy(api_server_id, {
          allow_dynamic_clients,
          resource_url_match_mode,
        });
      }

      await jwksRegistry.storeNewKey({
        api_server_id,
        created_at: now,
        key_id: api_server_id,
        key_algorithm: sign_verify_alg,
        is_active: true,
        public_key: jwks_access_public_key,
      });

      if (client_secret) {
        await appRegistry.setClientSecret(api_server_id, hashClientSecret(client_secret), null);
      }

      for (const other_api_server_id of connect_to_api_server_ids ?? []) {
        if (other_api_server_id === api_server_id) continue;
        await appToApiRegistry.allow(api_server_id, other_api_server_id, null);
      }

      for (const callback_url of callback_urls ?? []) {
        await appRegistry.addAppCallbackUrl(api_server_id, {
          app_callback_url_ref_id: randomUUID(),
          app_id: api_server_id,
          callback_url,
          environment,
          created_at: now,
        });
      }
    } catch (e: unknown) {
      console.error("Error seeding database with sample app/API for usage in tests: ", e);
      return ctx.json(500, {
        message: "Internal server error while seeding database with sample app/API for usage in tests!",
        error: true,
        success: false,
      });
    }

    return ctx.json(200, {
      message: "Successfully seeded database with sample app/API for usage in tests!",
      error: false,
      success: true,
    });
  },
});
