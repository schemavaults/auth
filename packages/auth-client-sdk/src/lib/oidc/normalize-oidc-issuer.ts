// normalize-oidc-issuer.ts
//
// Canonicalizes an auth server URL into its OIDC issuer identifier.

/**
 * Strips a trailing slash so the issuer matches `getAuthServerUrl()` —
 * and therefore the `iss` claim of the id_tokens the auth server mints
 * and the RFC 9207 `iss` authorization-response parameter, both of which
 * are compared byte-for-byte by openid-client.
 */
export function normalizeOidcIssuer(auth_server_url: string): string {
  if (typeof auth_server_url !== "string" || auth_server_url.length === 0) {
    throw new TypeError("Expected 'auth_server_url' to be a non-empty string!");
  }
  return auth_server_url.endsWith("/")
    ? auth_server_url.slice(0, -1)
    : auth_server_url;
}

export default normalizeOidcIssuer;
