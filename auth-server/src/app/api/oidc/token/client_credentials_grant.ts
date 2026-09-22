import "server-only";
import type { NextResponse } from "next/server";
import {
  OIDC_OPENID_SCOPE,
  oidcScopeSchema,
  parseAndGrantScopes,
  type UserData,
} from "@schemavaults/auth-common";
import { loadUserData, UserRegistry } from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
} from "@/lib/oidc/token-request-extensions";
import type { ApiServerId } from "@schemavaults/app-definitions";
import type { OidcGrantContext, OidcGrantOutcome } from "./token-response";

/**
 * grant_type=client_credentials (RFC 6749 §4.4): machine-to-machine
 * access tokens for the client application itself. The grant is
 * restricted to confidential clients (§4.4: "MUST only be used by
 * confidential clients"), i.e. apps with a registered client secret that
 * authenticated with it on this request — route.ts already ran client
 * authentication, so a public client reaching this handler is refused
 * with `unauthorized_client`.
 *
 * There is no resource owner: the token's subject is the app's SERVICE
 * ACCOUNT (a machine identity stored as a USERS row and created on the
 * first grant — see app-service-accounts.ts). The response carries the
 * access token only: no refresh token (§4.4.3 — the client simply
 * re-authenticates), and never an id_token (no end user was
 * authenticated, so `openid` is dropped from the requested scope; the
 * granted set is echoed back per §5.1). The RFC 8707 `resource`
 * parameter selects the audience exactly as on the other grants
 * (default: the reserved `oidc-userinfo` audience, which keeps the token
 * introspectable at /api/oidc/introspect; like any token without
 * `openid`, /api/oidc/userinfo refuses it with `insufficient_scope`).
 */
export async function handleOidcClientCredentialsGrant({
  dbh,
  form,
  client_app_id,
  client_authenticated,
  param,
  environment,
  debug,
}: OidcGrantContext): Promise<OidcGrantOutcome> {
  const fail = (response: NextResponse): OidcGrantOutcome => ({
    ok: false,
    response,
  });

  if (!client_authenticated) {
    return fail(
      oidcTokenErrorResponse(
        "unauthorized_client",
        "The client credentials grant is only available to confidential clients; register a client secret for this app and authenticate with it.",
      ),
    );
  }

  // RFC 6749 §4.4.2: `scope` is OPTIONAL. Unknown scopes are dropped (as
  // everywhere on the OIDC surface) and so is `openid`: no end user
  // authenticated, so no OpenID authentication took place.
  let scope: string = "";
  const requested_scope = param("scope");
  if (requested_scope !== null) {
    if (!oidcScopeSchema.safeParse(requested_scope).success) {
      return fail(
        oidcTokenErrorResponse("invalid_scope", "Malformed 'scope' parameter."),
      );
    }
    scope = parseAndGrantScopes(requested_scope)
      .granted.filter((s) => s !== OIDC_OPENID_SCOPE)
      .join(" ");
  }

  const parsed_resource = parseOidcTokenResourceParam(form, environment);
  if (!parsed_resource.ok) {
    return fail(
      oidcTokenErrorResponse(
        parsed_resource.error.error,
        parsed_resource.error.error_description,
      ),
    );
  }
  const resource: string | null = parsed_resource.resource;

  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const { user: service_account } = await appRegistry.getOrCreateServiceAccount(
    client_app_id,
    debug,
  );
  const user: UserData = await loadUserData(
    service_account.uid,
    new UserRegistry(dbh.db, debug),
  );
  if (user.disabled) {
    // A disabled service account is an administrative decision to cut
    // the app's machine access off; the client's credentials are valid
    // but the client is no longer authorized to use this grant.
    return fail(
      oidcTokenErrorResponse(
        "unauthorized_client",
        "The service account for this client application is disabled.",
      ),
    );
  }

  // The validated resource, resolved to the API server whose keyset
  // signs the token: `access_token_audience` is what the token's `aud`
  // carries (a resource URL verbatim), `api_server_id` the keyset owner.
  let access_token_audience: string | undefined = undefined;
  let access_token_audience_api_server_id: ApiServerId | undefined = undefined;
  if (resource !== null) {
    const validated_resource = await validateOidcTokenResource({
      uid: user.uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    });
    if (!validated_resource.ok) {
      return fail(
        oidcTokenErrorResponse(
          validated_resource.error.error,
          validated_resource.error.error_description,
        ),
      );
    }
    access_token_audience = validated_resource.access_token_audience;
    access_token_audience_api_server_id = validated_resource.api_server_id;
  }

  const issued = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: null,
    grant_type: "client_credentials",
    environment,
    include_id_token: false,
    issue_refresh_token: false,
    access_token_audience,
    access_token_audience_api_server_id,
    debug,
  });
  return { ok: true, issued };
}

export default handleOidcClientCredentialsGrant;
