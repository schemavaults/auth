import {
  apiServerIdSchema,
  getAppEnvironment,
  getAuthServerUrl,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { z as zod } from "zod";

// NOTE: Do not add module-scope `createAudienceSchema(...)` results here. The
// factories below read SCHEMAVAULTS_APP_ENVIRONMENT (via getAppEnvironment())
// and the auth-server URL, which are runtime concerns; eager module-scope
// initialization breaks `next build` in Docker where those env vars are unset.

export function createAudienceSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  const auth_server_url: string = getAuthServerUrl(environment);

  const authServerUrlSchema = z
    .string()
    .url()
    .refine((url): url is typeof auth_server_url => url === auth_server_url)
    .describe("Allow the auth-server URL configured for the current server!");

  const apiServerIdWithoutAuthServerIdSchema = apiServerIdSchema
    .refine((id) => {
      return id !== SCHEMAVAULTS_AUTH_APP_ID;
    }, `Auth app ID ('${SCHEMAVAULTS_AUTH_APP_ID}') is not allowed as an audience; use the auth-server URL for tokens with the auth-server audience!`)
    .describe(
      `An API server ID, but the auth app's ID (${SCHEMAVAULTS_AUTH_APP_ID}) is forbidden.`,
    );

  return z.union([authServerUrlSchema, apiServerIdWithoutAuthServerIdSchema]);
}

const MAX_APPS_IN_AUDIENCE_LIST = 10 as const satisfies number;

export function createAudienceListSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  return createAudienceSchema(z, environment)
    .array()
    .min(1, "Audience list may not be empty")
    .max(
      MAX_APPS_IN_AUDIENCE_LIST,
      `Audience list may not contain more than ${MAX_APPS_IN_AUDIENCE_LIST} audience references.`,
    );
}
