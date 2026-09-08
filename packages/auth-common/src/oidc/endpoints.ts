/**
 * OIDC / OAuth2 endpoint paths served by the auth server, relative to
 * its issuer identifier (the auth server URL).
 *
 * Single source of truth shared by:
 *   - the auth server's discovery document
 *     (`/.well-known/openid-configuration`), which advertises these
 *     absolute URLs, and
 *   - `@schemavaults/auth-client-sdk`, which builds its `openid-client`
 *     Configuration statically from the same paths (skipping a discovery
 *     round trip on every client instantiation).
 *
 * The SDK and server must agree byte-for-byte on these, so they are
 * never hardcoded at either end.
 */
export const OIDC_ENDPOINT_PATHS = {
  discovery: "/.well-known/openid-configuration",
  authorization: "/api/oidc/authorize",
  token: "/api/oidc/token",
  userinfo: "/api/oidc/userinfo",
  introspection: "/api/oidc/introspect",
  jwks: "/api/oidc/jwks",
} as const satisfies Record<string, `/${string}`>;

export type OidcEndpointName = keyof typeof OIDC_ENDPOINT_PATHS;

/**
 * Resolves an OIDC endpoint to its absolute URL for the given issuer.
 *
 * `issuer` is the auth server URL exactly as it appears in the `iss`
 * claim (never with a trailing slash — see `getAuthServerUrl()`); a
 * trailing slash is tolerated and stripped so the result is stable.
 */
export function getOidcEndpointUrl(
  issuer: string,
  endpoint: OidcEndpointName,
): string {
  if (typeof issuer !== "string" || issuer.length === 0) {
    throw new TypeError("Expected 'issuer' to be a non-empty string!");
  }
  const path: `/${string}` | undefined = OIDC_ENDPOINT_PATHS[endpoint];
  if (typeof path !== "string") {
    throw new RangeError(`Unknown OIDC endpoint '${String(endpoint)}'`);
  }
  const base: string = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
  return `${base}${path}`;
}
