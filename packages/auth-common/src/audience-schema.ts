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

/**
 * Longest RFC 8707 resource indicator URL accepted as a token audience;
 * matches the callback URL cap so both URL-shaped inputs share a bound.
 */
export const RESOURCE_URL_AUDIENCE_MAX_LENGTH = 2048 as const;

/**
 * An RFC 8707 resource indicator in URL form: an absolute `https` (or
 * `http`, for loopback / development resource servers) URL without a
 * fragment (§2: "MUST NOT include a fragment component"). Resource
 * servers that identify themselves by URL — MCP servers in particular —
 * are matched against an API server's registered domains by the auth
 * server, and the issued access token carries the URL verbatim as its
 * `aud`.
 */
export function createResourceUrlAudienceSchema(z: typeof zod) {
  return z
    .url({ protocol: /^https?$/ })
    .max(RESOURCE_URL_AUDIENCE_MAX_LENGTH)
    .refine(
      (url: string): boolean => !url.includes("#"),
      "A resource indicator must not include a fragment component",
    )
    .describe(
      "An RFC 8707 resource indicator URL identifying a registered API server by one of its domains",
    );
}

/**
 * A token audience is one of:
 *  - the auth server URL (tokens for the auth server itself),
 *  - a registered API server id (used verbatim as the `aud`), or
 *  - an RFC 8707 resource URL that the auth server resolves to a
 *    registered API server through its domains (`aud` = the URL).
 * The bare auth app id is rejected everywhere.
 */
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

  return z.union([
    authServerUrlSchema,
    apiServerIdWithoutAuthServerIdSchema,
    createResourceUrlAudienceSchema(z),
  ]);
}

/**
 * @description Whether a (schema-valid) token audience is an RFC 8707
 * resource URL — i.e. a URL other than the auth server's own URL. Such
 * an audience must be resolved to an API server before a token can be
 * minted or verified for it.
 */
export function isResourceUrlAudience(
  audience: string,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
): boolean {
  if (typeof audience !== "string" || audience.length === 0) {
    return false;
  }
  const auth_server_url: string =
    overrides?.auth_server_url ?? getAuthServerUrl(environment);
  if (audience === auth_server_url) {
    return false;
  }
  return /^https?:\/\//i.test(audience);
}

const MAX_APPS_IN_AUDIENCE_LIST = 10 as const satisfies number;

/**
 * A list of token audiences. The list may be empty: at the token endpoints
 * an empty audience list means the grant mints no access tokens —
 * authenticate (or rotate the refresh token) only, which is how clients
 * configured with no default token audiences complete a login. Call sites
 * that require at least one audience must enforce non-emptiness themselves.
 */
export function createAudienceListSchema(
  z: typeof zod,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  overrides?: AudienceSchemaOverrides,
) {
  return createAudienceSchema(z, environment, overrides)
    .array()
    .max(
      MAX_APPS_IN_AUDIENCE_LIST,
      `Audience list may not contain more than ${MAX_APPS_IN_AUDIENCE_LIST} audience references.`,
    );
}
