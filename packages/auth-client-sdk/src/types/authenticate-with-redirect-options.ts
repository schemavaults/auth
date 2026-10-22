/**
 * Options of `login()` / `register()`: the authorization request the SDK
 * redirects to the auth server with.
 */
export interface AuthenticateWithRedirectOptions {
  /**
   * Space-delimited scopes to request (RFC 6749 §3.3). Defaults to
   * DEFAULT_AUTH_SCOPE ("openid email profile").
   */
  scope?: string;
  /**
   * RFC 8707 resource indicator: the API server id (or the URL of one of
   * its registered domains) whose API scopes `scope` asks for, e.g.
   * `{ scope: "openid email profile notes:read", resource: "my-notes-api" }`.
   * The auth server grants the requested scopes that API server defines;
   * the access tokens acquired for it carry them. Omit to request OIDC
   * scopes only.
   */
  resource?: string;
}
