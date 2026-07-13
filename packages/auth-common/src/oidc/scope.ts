/**
 * OIDC scope handling for the parallel OIDC surface.
 *
 * The platform's own authorization model is audience-based
 * (see audience-schema.ts / APP_TO_API_PERMISSIONS); OAuth2 scopes exist
 * only on the OIDC surface, where `openid` is mandatory (OIDC Core §3.1.2.1)
 * and `email`/`profile` gate which claims the id_token and /userinfo
 * response carry. Unknown scopes are silently dropped per RFC 6749 §3.3
 * (the granted set is echoed back in the token response, so RPs that
 * hardcode e.g. "openid profile email address" still interoperate).
 */

export const OIDC_OPENID_SCOPE = "openid" as const;

export const OIDC_SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

/**
 * Scope requested by default when a flow does not name one explicitly:
 * the SDK's `authenticateWithRedirect`/`sendAuthenticateRequest`
 * default, and the AuthForm's fallback for entry URLs without a
 * `scope` parameter (e.g. the auth server's own /account flow).
 */
export const DEFAULT_AUTH_SCOPE = "openid email profile" as const;

export type OidcSupportedScope = (typeof OIDC_SUPPORTED_SCOPES)[number];

export interface ParsedOidcScopes {
  /**
   * The intersection of the requested scopes with
   * OIDC_SUPPORTED_SCOPES, deduplicated, in request order.
   */
  granted: OidcSupportedScope[];
  /** Whether the request included the mandatory `openid` scope. */
  hasOpenid: boolean;
}

function isSupportedOidcScope(scope: string): scope is OidcSupportedScope {
  return (OIDC_SUPPORTED_SCOPES as readonly string[]).includes(scope);
}

/**
 * Parses a raw `scope` request parameter (space-delimited per
 * RFC 6749 §3.3) into the granted subset. Non-string or empty input
 * grants nothing (callers reject missing `openid` via `hasOpenid`).
 */
export function parseAndGrantScopes(raw: unknown): ParsedOidcScopes {
  if (typeof raw !== "string") {
    return { granted: [], hasOpenid: false };
  }

  const granted: OidcSupportedScope[] = [];
  for (const token of raw.split(" ")) {
    if (!token) continue; // collapse repeated separators
    if (isSupportedOidcScope(token) && !granted.includes(token)) {
      granted.push(token);
    }
  }

  return { granted, hasOpenid: granted.includes(OIDC_OPENID_SCOPE) };
}

/**
 * Serializes granted scopes back to the space-delimited wire format for
 * the token response `scope` field and the AUTHORIZATION_CODES row.
 */
export function serializeOidcScopes(scopes: readonly string[]): string {
  return scopes.join(" ");
}
