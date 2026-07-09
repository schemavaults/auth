import {
  type AppId,
  appIdSchema,
  DEFAULT_AUTH_SERVER_APP_ID,
} from "@schemavaults/app-definitions";

/**
 * @description Resolves the auth server deployment's own app id for E2E tests
 * from the SCHEMAVAULTS_AUTH_SERVER_APP_ID Cypress environment variable, so a
 * suite can run against a white-label deployment with a custom app id (e.g.
 * "acme-corp-auth"). Set it to the same value as the auth server's
 * SCHEMAVAULTS_AUTH_SERVER_APP_ID environment variable — via the `env` block
 * in cypress.config.ts or a CYPRESS_SCHEMAVAULTS_AUTH_SERVER_APP_ID OS
 * environment variable. Defaults to "schemavaults-auth" when unset, matching
 * the server-side getAuthServerAppId() fallback.
 *
 * Browser-context only (specs, support files, commands) — Node-side config
 * code (setupNodeEvents tasks/hooks) must read `config.env` instead, since
 * the Cypress global does not exist there.
 *
 * @throws if the Cypress environment variable is set but is not a valid app ID
 */
export function getAuthServerAppIdFromCypressEnv(): AppId {
  const app_id: unknown = Cypress.env("SCHEMAVAULTS_AUTH_SERVER_APP_ID");
  if (typeof app_id !== "string" || app_id.length === 0) {
    return DEFAULT_AUTH_SERVER_APP_ID;
  }

  const parsed = appIdSchema.safeParse(app_id);
  if (!parsed.success) {
    throw new Error(
      "Failed to load 'SCHEMAVAULTS_AUTH_SERVER_APP_ID' from Cypress environment variables!",
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data;
}

export default getAuthServerAppIdFromCypressEnv;
