import {
  apiServerIdSchema,
  getAppEnvironment,
  getAuthServerAppId,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { z as zod } from "zod";

// NOTE: Do not add module-scope `createAudienceSchema(...)` results here. The
// factories below read SCHEMAVAULTS_APP_ENVIRONMENT (via getAppEnvironment()),
// the auth-server URL, and the auth server's own app id, which are runtime
// concerns; eager module-scope initialization breaks `next build` in Docker
// where those env vars are unset.

export interface AudienceSchemaOverrides {
  /**
   * The auth server's public URL. Browser bundles can't read the
   * SCHEMAVAULTS_AUTH_SERVER_URL environment variable (they'd silently
   * resolve the per-environment default), so client-side callers must inject
   * the URL their auth client was configured with. Server-side callers can
   * omit it to resolve from the environment.
   */
  auth_server_url?: string;
  /**
   * The auth server deployment's own app id. Same story as auth_server_url:
   * client-side callers must inject their configured value in white-label
   * deployments; server-side callers can omit it.
   */
  auth_server_app_id?: string;
}

export function createAudienceSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  const auth_server_url: string =
    overrides?.auth_server_url ?? getAuthServerUrl(environment);
  const auth_server_app_id: string =
    overrides?.auth_server_app_id ?? getAuthServerAppId();

  const authServerUrlSchema = z
    .string()
    .url()
    .refine((url): url is typeof auth_server_url => url === auth_server_url)
    .describe("Allow the auth-server URL configured for the current server!");

  const apiServerIdWithoutAuthServerIdSchema = apiServerIdSchema
    .refine((id) => {
      return id !== auth_server_app_id;
    }, `Auth app ID ('${auth_server_app_id}') is not allowed as an audience; use the auth-server URL for tokens with the auth-server audience!`)
    .describe(
      `An API server ID, but the auth app's ID (${auth_server_app_id}) is forbidden.`,
    );

  return z.union([authServerUrlSchema, apiServerIdWithoutAuthServerIdSchema]);
}

const MAX_APPS_IN_AUDIENCE_LIST = 10 as const satisfies number;

export function createAudienceListSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  return createAudienceSchema(z, environment, overrides)
    .array()
    .min(1, "Audience list may not be empty")
    .max(
      MAX_APPS_IN_AUDIENCE_LIST,
      `Audience list may not contain more than ${MAX_APPS_IN_AUDIENCE_LIST} audience references.`,
    );
}
