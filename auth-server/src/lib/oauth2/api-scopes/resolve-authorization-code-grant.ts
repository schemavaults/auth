import "server-only";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  grantRequestedScopes,
  isOidcReservedScope,
  serializeOidcScopesOrNull,
} from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { listGrantableApiScopeValues } from "@/lib/auth-db/apis";
import { listConsentedApiScopeValues } from "@/lib/auth-db/api-scope-consents";
import type { AuthorizationCodeGrantContext } from "@/lib/auth-db/users/generate-authorization-code";
import { resolveGrantResource } from "./resolve-grant-resource";

export interface ResolveAuthorizationCodeGrantOptions {
  dbh: ServerlessDatabase;
  client_app_id: AppId;
  /**
   * The user the code is minted for, whose per-scope consent the API
   * scopes are filtered by; null before there is one (registration, the
   * authorize bridge), when no API scope can be granted yet.
   */
  uid: string | null;
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
  /**
   * What to bind to the authorization code: the supported OIDC scopes plus
   * the requested API scopes the app may be granted AND the user consented
   * to.
   */
  grant: AuthorizationCodeGrantContext;
  /**
   * What the flow asks for: the supported OIDC scopes plus the requested
   * API scopes the app may be granted, consented or not (the authorize
   * bridge forwards it to the login UI); null when that is nothing.
   */
  requested_scope: string | null;
  /**
   * The resource whose API scopes the flow asks for (the value to forward
   * on the login flow's URL); null when it asks for none the app may get.
   */
  resource: string | null;
  /** The API server `resource` names, when the flow asks for its scopes. */
  api_server_id: ApiServerId | null;
  /** The requested API scopes the app may be granted. */
  requested_api_scopes: string[];
  /** Those of them the user has not consented to (all of them without a user). */
  pending_api_scopes: string[];
  /**
   * The OIDC part of the granted scope: what the auth server's OWN session
   * cookie may carry (a third-party API's scopes never land on it).
   */
  session_scope: string | null;
}

/**
 * Derives the grant of an authorization request from its requested `scope`
 * and RFC 8707 `resource`: the supported OIDC scopes, plus — when the
 * resource names an API server this client may use (`resolveGrantResource`)
 * — the requested scopes that API server defines which
 *
 *  1. the app may be granted on behalf of users (its connection's `user`
 *     allowance, see `listGrantableApiScopeValues`), and
 *  2. the user consented to (USER_APP_SCOPE_CONSENTS),
 *
 * bound to the API server through `scope_api_server_id`. Requested scopes
 * passing (1) but not (2) are reported as `pending_api_scopes`: the consent
 * screen asks for them. Without a usable resource the result is exactly the
 * OIDC-only grant every flow minted before API scopes existed. Never trusts
 * the requested scope verbatim.
 */
export async function resolveAuthorizationCodeGrant({
  dbh,
  client_app_id,
  uid,
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
  const grantable_api_scopes: string[] = bound
    ? await listGrantableApiScopeValues(dbh.db, {
        client_app_id,
        api_server_id: bound.api_server_id,
        grantee: "user",
      })
    : [];
  const requested = grantRequestedScopes(requested_scope, grantable_api_scopes);
  const asks_for_api_scopes: boolean = bound !== null && requested.api.length > 0;

  const consented: ReadonlySet<string> = new Set(
    asks_for_api_scopes && uid !== null
      ? await listConsentedApiScopeValues(dbh.db, {
          uid,
          client_app_id,
          api_server_id: bound!.api_server_id,
        })
      : [],
  );
  const granted: string[] = requested.granted.filter(
    (token) => !requested.api.includes(token) || consented.has(token),
  );
  const granted_api: string[] = requested.api.filter((token) => consented.has(token));

  return {
    grant: {
      nonce,
      scope: serializeOidcScopesOrNull(granted),
      scope_api_server_id: granted_api.length > 0 ? bound!.api_server_id : null,
    },
    requested_scope: serializeOidcScopesOrNull(requested.granted),
    resource: asks_for_api_scopes ? bound!.resource : null,
    api_server_id: asks_for_api_scopes ? bound!.api_server_id : null,
    requested_api_scopes: asks_for_api_scopes ? [...requested.api] : [],
    pending_api_scopes: asks_for_api_scopes
      ? requested.api.filter((token) => !consented.has(token))
      : [],
    session_scope: serializeOidcScopesOrNull(requested.oidc),
  };
}

export default resolveAuthorizationCodeGrant;
