import {
  OIDC_SUPPORTED_SCOPES,
  oidcScopeSchema,
  partitionGrantedScopes,
} from "@schemavaults/auth-common";

// NOT server-only: pure functions (unit tested under `bun test`). The
// database lookups live in `resolve-authorization-code-grant.ts`.

function isSupportedOidcScope(token: string): boolean {
  return (OIDC_SUPPORTED_SCOPES as readonly string[]).includes(token);
}

function uniqueTokens(scope: string | null | undefined): string[] {
  const tokens: string[] = [];
  for (const token of (scope ?? "").split(" ")) {
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

export interface SplitTokenScopesOptions {
  /** The grant's scope: the code row's, or the presented refresh token's (already narrowed). */
  granted_scope: string | null | undefined;
  /** The API server whose API scopes `granted_scope` carries, if any. */
  scope_api_server_id: string | null | undefined;
  /** The scope values that API server defines NOW (deleted scopes drop off). */
  defined_api_scopes: ReadonlySet<string>;
  /**
   * The API server the access token is minted for; null for the reserved
   * userinfo audience (no `resource` on the token request).
   */
  access_token_api_server_id: string | null;
}

export interface TokenScopes {
  /** Scope of the access token, also echoed as the token response's `scope`. */
  access_token_scope: string;
  /** Scope the (rotated) refresh token carries forward. */
  refresh_token_scope: string;
  /** The refresh token's `scope_api_server_id` claim; null when it carries no API scopes. */
  refresh_token_scope_api_server_id: string | null;
}

/**
 * Splits a grant's scope into what the access token and the refresh token
 * carry. OIDC scopes go on both. API scopes stay on the refresh token
 * (while their API server still defines them) but go on the access token
 * only when it is minted for the API server that defines them: a token for
 * another API server, or for the userinfo audience, never carries them.
 * A grant without API scopes yields the same scope on both tokens, as
 * before API scopes existed.
 */
export function splitTokenScopes({
  granted_scope,
  scope_api_server_id,
  defined_api_scopes,
  access_token_api_server_id,
}: SplitTokenScopesOptions): TokenScopes {
  const access: string[] = [];
  const refresh: string[] = [];
  let carries_api_scopes = false;
  for (const token of uniqueTokens(granted_scope)) {
    if (isSupportedOidcScope(token)) {
      access.push(token);
      refresh.push(token);
    } else if (scope_api_server_id && defined_api_scopes.has(token)) {
      refresh.push(token);
      carries_api_scopes = true;
      if (access_token_api_server_id === scope_api_server_id) {
        access.push(token);
      }
    }
  }
  return {
    access_token_scope: access.join(" "),
    refresh_token_scope: refresh.join(" "),
    refresh_token_scope_api_server_id: carries_api_scopes
      ? (scope_api_server_id ?? null)
      : null,
  };
}

export type NarrowedGrantScope =
  | { ok: true; scope: string }
  | { ok: false; reason: "malformed" | "exceeds_grant" };

/**
 * RFC 6749 §6 scope re-request on the refresh grant: the requested scope
 * must not exceed the original grant. Requested scopes this server can
 * grant (the supported OIDC scopes, and the API scopes the grant's API
 * server defines) must all have been granted originally; any other value
 * is unknown and dropped, as everywhere on the OIDC surface. The result
 * keeps the request order.
 */
export function narrowGrantedScope(
  original_scope: string | null | undefined,
  requested_scope: string,
  defined_api_scopes: ReadonlySet<string>,
): NarrowedGrantScope {
  if (!oidcScopeSchema.safeParse(requested_scope).success) {
    return { ok: false, reason: "malformed" };
  }
  const original = new Set(uniqueTokens(original_scope));
  const narrowed: string[] = [];
  for (const token of uniqueTokens(requested_scope)) {
    const grantable =
      isSupportedOidcScope(token) || defined_api_scopes.has(token);
    if (!grantable) continue;
    if (!original.has(token)) {
      return { ok: false, reason: "exceeds_grant" };
    }
    narrowed.push(token);
  }
  return { ok: true, scope: narrowed.join(" ") };
}

/** The OIDC part of a granted scope (for the auth server's own session cookie). */
export function oidcPartOfGrantedScope(scope: string | null | undefined): string | null {
  const { oidc } = partitionGrantedScopes(scope);
  return oidc.length > 0 ? oidc.join(" ") : null;
}
