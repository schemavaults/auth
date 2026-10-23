import "server-only";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  partitionGrantedScopes,
  type AppConsentStatus,
  type ConsentScope,
} from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { SchemaVaultsApiServerRegistry, listApiServerScopes } from "@/lib/auth-db/apis";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  resolveAuthorizationCodeGrant,
  type ResolvedAuthorizationCodeGrant,
} from "./resolve-authorization-code-grant";

export interface DescribeAppConsentStatusOptions {
  dbh: ServerlessDatabase;
  uid: string;
  client_app_id: AppId;
  /** The authorization request's requested `scope` (wire-format validated), null if none. */
  scope: string | null | undefined;
  /** The authorization request's RFC 8707 `resource`, null if none. */
  resource: string | null | undefined;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export interface DescribedAppConsentStatus extends AppConsentStatus {
  /** The resolved grant the status was derived from (for minting the code next). */
  resolved: ResolvedAuthorizationCodeGrant;
}

/**
 * What the signed-in user would be agreeing to for one authorization
 * request, and whether the consent screen must be shown: the app is not
 * authorized yet, or the request asks for API scopes (that the app may be
 * granted) the user has not consented to. Requests without API scopes
 * behave exactly as before per-scope consent: consent is needed only for
 * an app the user never authorized. The auth server's own app never needs
 * consent.
 */
export async function describeAppConsentStatus({
  dbh,
  uid,
  client_app_id,
  scope,
  resource,
  environment,
  debug = false,
}: DescribeAppConsentStatusOptions): Promise<DescribedAppConsentStatus> {
  const is_auth_server_app: boolean = client_app_id === getAuthServerAppId();
  const [authorized, resolved] = await Promise.all([
    is_auth_server_app
      ? Promise.resolve(true)
      : isAppAuthorizedForUser(dbh.db, uid, client_app_id, debug),
    resolveAuthorizationCodeGrant({
      dbh,
      client_app_id,
      uid,
      nonce: null,
      scope,
      resource,
      environment,
      debug,
    }),
  ]);

  let api_server: AppConsentStatus["api_server"] = null;
  let granted_api_scopes: ConsentScope[] = [];
  let pending_api_scopes: ConsentScope[] = [];
  if (resolved.api_server_id) {
    const [definition, defined] = await Promise.all([
      new SchemaVaultsApiServerRegistry(dbh.db, debug).getApiServer(resolved.api_server_id),
      listApiServerScopes(dbh.db, resolved.api_server_id),
    ]);
    api_server = {
      api_server_id: resolved.api_server_id,
      api_server_name: definition?.api_server_name ?? resolved.api_server_id,
    };
    const byValue = new Map(defined.map((d) => [d.scope, d]));
    const describe = (value: string): ConsentScope[] => {
      const d = byValue.get(value);
      return d
        ? [{ api_server_scope_id: d.api_server_scope_id, scope: d.scope, description: d.description }]
        : [];
    };
    const pending = new Set(resolved.pending_api_scopes);
    granted_api_scopes = resolved.requested_api_scopes
      .filter((value) => !pending.has(value))
      .flatMap(describe);
    pending_api_scopes = resolved.pending_api_scopes.flatMap(describe);
  }

  return {
    success: true,
    authorized,
    consent_required:
      !is_auth_server_app && (!authorized || pending_api_scopes.length > 0),
    requested_oidc_scopes: partitionGrantedScopes(resolved.requested_scope).oidc,
    api_server,
    granted_api_scopes,
    pending_api_scopes,
    resolved,
  };
}

/** The consent status without the internal resolved grant (the API response). */
export function toAppConsentStatus({
  resolved: _resolved,
  ...status
}: DescribedAppConsentStatus): AppConsentStatus {
  void _resolved;
  return status;
}

export default describeAppConsentStatus;
