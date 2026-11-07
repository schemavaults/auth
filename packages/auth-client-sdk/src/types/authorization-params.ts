/**
 * Parameters of the authorization request (RFC 6749 §4.1.1) that `login()`
 * and `register()` send the user to the auth server with.
 */
export interface AuthorizationParams {
  /**
   * Space-delimited scopes to request (RFC 6749 §3.3): OpenID scopes and the
   * API scopes of `resource` alike, e.g. "openid email profile notes:read".
   * Defaults to DEFAULT_AUTH_SCOPE ("openid email profile").
   */
  scope?: string;
  /**
   * RFC 8707 resource indicator: the API server id (or the URL of one of its
   * registered domains) whose API scopes `scope` asks for, e.g.
   * `{ scope: "openid email profile notes:read", resource: "my-notes-api" }`.
   * The auth server grants the requested scopes that API server defines and
   * the user consents to; the access tokens acquired for it carry them. Omit
   * to request OIDC scopes only.
   */
  resource?: string;
}

/**
 * The authorization request a sign-in actually made, once the call's own
 * parameters and the client's `authorization_params` are merged: kept across
 * the authorize redirect and recorded as the session's once its code is
 * redeemed (see `needsReauthorization()`).
 */
export interface SignInAuthorizationRequest {
  /** The space-delimited scopes requested. */
  scope: string;
  /** The RFC 8707 resource requested, null for none. */
  resource: string | null;
}
