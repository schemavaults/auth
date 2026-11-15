import "server-only";
import type { NextResponse } from "next/server";
import type { ApiServerId } from "@schemavaults/app-definitions";
import { parseAndGrantScopes, type UserData } from "@schemavaults/auth-common";
import {
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  loadUserData,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import {
  pollDeviceAuthorization,
  type DevicePollResult,
} from "@/lib/auth-db/device-authorizations";
import { TOKEN_ENDPOINT_WWW_AUTHENTICATE } from "@/lib/oauth2/authenticate-token-endpoint-client";
import { listUsableApiScopeValues, splitTokenScopes } from "@/lib/oauth2/api-scopes";
import { checkDeviceFlowClient } from "@/lib/oidc/device-authorization";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
} from "@/lib/oidc/token-request-extensions";
import type { OidcGrantContext, OidcGrantOutcome } from "./token-response";

/** The RFC 8628 §3.5 answer to a poll that yields no tokens. */
function pollErrorResponse(
  result: Exclude<DevicePollResult, { kind: "redeemed" }>,
): NextResponse {
  switch (result.kind) {
    case "authorization_pending":
      return oidcTokenErrorResponse(
        "authorization_pending",
        "The user has not approved the request yet; poll again after the interval.",
      );
    case "slow_down":
      return oidcTokenErrorResponse(
        "slow_down",
        `Polling too fast: wait at least ${result.interval_seconds} seconds between requests from now on.`,
      );
    case "access_denied":
      return oidcTokenErrorResponse("access_denied", "The user denied the request.");
    case "expired_token":
      return oidcTokenErrorResponse(
        "expired_token",
        "The device code has expired; start a new device authorization request.",
      );
    case "invalid_grant":
      return oidcTokenErrorResponse(
        "invalid_grant",
        result.reason === "redeemed"
          ? "The device code was already redeemed."
          : "Invalid device code (or it was issued to another client).",
      );
  }
}

/**
 * grant_type=urn:ietf:params:oauth:grant-type:device_code (RFC 8628 §3.4):
 * a device polling with the device code of a device authorization request
 * (POST /api/oidc/device_authorization). Until the user decides on the
 * `/device` page it answers `authorization_pending` (or `slow_down`, when
 * the device polls faster than its interval); then `access_denied`, or —
 * once — the token set the user approved: access + refresh, plus an
 * id_token iff the granted scope includes `openid`. An expired device code
 * answers `expired_token`.
 *
 * The client must still be allowed the grant on every poll
 * (`checkDeviceFlowClient()`), so disabling it cuts off flows in progress.
 * Redeeming re-checks what the authorization code grant does: the session
 * the user approved from was not revoked since (password reset, sign-out
 * everywhere), the account is enabled, the app is still authorized, and the
 * API scopes are still allowed and consented. A device code is spent once
 * redeemed, even when one of those checks then refuses the request.
 */
export async function handleOidcDeviceCodeGrant({
  dbh,
  form,
  param,
  client_app_id,
  client_app,
  environment,
  debug,
}: OidcGrantContext): Promise<OidcGrantOutcome> {
  const fail = (response: NextResponse): OidcGrantOutcome => ({ ok: false, response });

  const device_code: string | null = param("device_code");
  if (!device_code) {
    return fail(oidcTokenErrorResponse("invalid_request", "Missing 'device_code' parameter."));
  }

  const client_check = await checkDeviceFlowClient(dbh.db, client_app);
  if (!client_check.ok) {
    return fail(
      client_check.error === "invalid_client"
        ? oidcTokenErrorResponse(client_check.error, client_check.error_description, 401, {
            "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE,
          })
        : oidcTokenErrorResponse(client_check.error, client_check.error_description),
    );
  }

  // RFC 8707 resource indicator, checked before the poll so a malformed
  // value never spends an approved device code.
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

  const poll: DevicePollResult = await pollDeviceAuthorization(dbh.db, {
    device_code,
    client_app_id,
  });
  if (poll.kind !== "redeemed") {
    return fail(pollErrorResponse(poll));
  }
  const { authorization } = poll;

  // The approval was given by a signed-in session. If that session was
  // revoked since (a password reset or a sign-out bumps the user's
  // tokens_valid_after watermark), the approval goes with it.
  const tokens_valid_after: number = await getUserTokensValidAfter(dbh.db, authorization.uid);
  const decided_at: number = authorization.decided_at ?? authorization.created_at;
  if (isTokenIatRevoked(Math.floor(decided_at / 1000), tokens_valid_after)) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "The request was approved by a session that has since been revoked.",
      ),
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);
  const user: UserData = await loadUserData(authorization.uid, userRegistry);
  if (user.disabled) {
    return fail(oidcTokenErrorResponse("invalid_grant", "Account is disabled."));
  }
  if (!(await isAppAuthorizedForUser(dbh.db, user.uid, client_app_id, debug))) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "The user has not authorized this client application.",
      ),
    );
  }

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

  // As on the authorization code grant: the approved API scopes go on the
  // access token only when it is minted for their API server, and stay on
  // the refresh token either way, re-checked against the app's allowance and
  // the user's consent as they stand now.
  const token_scopes = splitTokenScopes({
    granted_scope: authorization.scope,
    scope_api_server_id: authorization.scope_api_server_id,
    defined_api_scopes: await listUsableApiScopeValues(dbh, {
      uid: user.uid,
      client_app_id,
      api_server_id: authorization.scope_api_server_id,
    }),
    access_token_api_server_id: access_token_audience_api_server_id ?? null,
  });
  const scope: string = token_scopes.access_token_scope;
  const issued = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    refresh_token_scope: token_scopes.refresh_token_scope,
    refresh_token_scope_api_server_id: token_scopes.refresh_token_scope_api_server_id,
    nonce: null,
    grant_type: "device_code",
    environment,
    include_id_token: parseAndGrantScopes(scope).hasOpenid,
    access_token_audience,
    access_token_audience_api_server_id,
    debug,
  });
  return { ok: true, issued };
}

export default handleOidcDeviceCodeGrant;
