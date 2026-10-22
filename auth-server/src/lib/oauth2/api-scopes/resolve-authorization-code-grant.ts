import "server-only";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  grantRequestedScopes,
  isOidcReservedScope,
  serializeOidcScopesOrNull,
} from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { listApiServerScopeValues } from "@/lib/auth-db/apis";
import type { AuthorizationCodeGrantContext } from "@/lib/auth-db/users/generate-authorization-code";
import { resolveGrantResource } from "./resolve-grant-resource";

export interface ResolveAuthorizationCodeGrantOptions {
  dbh: ServerlessDatabase;
  client_app_id: AppId;
  /** The flow's login nonce (bound as-is). */
  nonce: string | null;
  /** The REQUESTED scope (wire-format validated by the caller), null if none. */
  scope: string | null | undefined;
  /** The authorization request's RFC 8707 `resource`, null if none. */
  resource: string | readonly string[] | null | undefined;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export interface ResolvedAuthorizationCodeGrant {
  /** What to bind to the authorization code. */
  grant: AuthorizationCodeGrantContext;
  /**
   * The resource whose API scopes were granted (the value to forward on the
   * login flow's URL); null when the grant holds no API scopes.
   */
  resource: string | null;
  /**
   * The OIDC part of the granted scope: what the auth server's OWN session
   * cookie may carry (a third-party API's scopes never land on it).
   */
  session_scope: string | null;
}

/**
 * Derives the grant an authorization code carries from the flow's
 * requested `scope` and RFC 8707 `resource`: the supported OIDC scopes,
 * plus — when the resource names an API server this client may use (see
 * `resolveGrantResource`) — the requested scopes that API server defines,
 * bound to it through `scope_api_server_id`. Without a usable resource the
 * result is exactly the OIDC-only grant every flow minted before API
 * scopes existed. Never trusts the requested scope verbatim.
 */
export async function resolveAuthorizationCodeGrant({
  dbh,
  client_app_id,
  nonce,
  scope,
  resource,
  environment,
  debug = false,
}: ResolveAuthorizationCodeGrantOptions): Promise<ResolvedAuthorizationCodeGrant> {
  const requested_scope: string | undefined = scope ?? undefined;
  // Only a request naming some non-OIDC scope can be granted API scopes;
  // every other flow skips the resource lookup altogether.
  const requests_api_scopes: boolean = (requested_scope ?? "")
    .split(" ")
    .some((token) => token.length > 0 && !isOidcReservedScope(token));
  const bound = requests_api_scopes
    ? await resolveGrantResource({
        dbh,
        client_app_id,
        resource,
        environment,
        debug,
      })
    : null;
  const defined_api_scopes: string[] = bound
    ? await listApiServerScopeValues(dbh.db, bound.api_server_id)
    : [];
  const { granted, oidc, api } = grantRequestedScopes(
    requested_scope,
    defined_api_scopes,
  );
  const holds_api_scopes: boolean = bound !== null && api.length > 0;
  return {
    grant: {
      nonce,
      scope: serializeOidcScopesOrNull(granted),
      scope_api_server_id: holds_api_scopes ? bound!.api_server_id : null,
    },
    resource: holds_api_scopes ? bound!.resource : null,
    session_scope: serializeOidcScopesOrNull(oidc),
  };
}

export default resolveAuthorizationCodeGrant;
