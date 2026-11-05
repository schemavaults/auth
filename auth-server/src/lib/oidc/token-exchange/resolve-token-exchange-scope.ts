// NOT server-only: a pure function (unit tested under `bun test`). The
// database lookups that feed it live in the grant handler.

import {
  narrowGrantedScope,
  splitTokenScopes,
  type NarrowedGrantScope,
} from "@/lib/oauth2/api-scopes/token-scopes";

export interface ResolveTokenExchangeScopeOptions {
  /** The `scope` claim of the subject token (absent: nothing granted). */
  subject_scope: string | null | undefined;
  /** The request's `scope` parameter; null when the request named none. */
  requested_scope: string | null;
  /** The API server the subject token, and so the delegated token, is for. */
  api_server_id: string;
  /** The scope values that API server defines now. */
  defined_api_scopes: ReadonlySet<string>;
  /**
   * The API scopes of that API server the client may still be granted for
   * this user AND the user still consents to (`listUsableApiScopeValues`).
   */
  usable_api_scopes: ReadonlySet<string>;
}

/**
 * The scope of a delegated access token: at most the subject token's
 * scope, never more.
 *
 *  - Without `scope`, the subject token's scope; with it, the requested
 *    subset (RFC 6749 §6 semantics, as on the refresh grant): a requested
 *    scope the subject token does not hold is `exceeds_grant`
 *    (`invalid_scope`), unknown values are dropped.
 *  - Then API scopes the client may no longer be granted, or the user no
 *    longer consents to, drop off, as they do on every refresh: an agent
 *    never keeps a scope its user withdrew while the subject token was
 *    live. OIDC scopes stay.
 */
export function resolveTokenExchangeScope({
  subject_scope,
  requested_scope,
  api_server_id,
  defined_api_scopes,
  usable_api_scopes,
}: ResolveTokenExchangeScopeOptions): NarrowedGrantScope {
  let granted: string = subject_scope ?? "";
  if (requested_scope !== null) {
    const narrowed = narrowGrantedScope(granted, requested_scope, defined_api_scopes);
    if (!narrowed.ok) {
      return narrowed;
    }
    granted = narrowed.scope;
  }
  const { access_token_scope } = splitTokenScopes({
    granted_scope: granted,
    scope_api_server_id: api_server_id,
    defined_api_scopes: usable_api_scopes,
    access_token_api_server_id: api_server_id,
  });
  return { ok: true, scope: access_token_scope };
}

export default resolveTokenExchangeScope;
