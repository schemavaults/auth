import "server-only";
import type { NextResponse } from "next/server";
import {
  getApiServerIdForTokenAudience,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  parseAndGrantScopes,
  type UserData,
} from "@schemavaults/auth-common";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  loadUserData,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  oidcTokenSuccessResponse,
  type OidcTokenFormParam,
} from "./token-response";

/**
 * grant_type=refresh_token (RFC 6749 §6 / OIDC Core §12): redeems a
 * scope-bearing refresh token issued by the OIDC surface for a fresh
 * token set (no id_token — OIDC Core §12.2 permits omitting it).
 * Called from route.ts after grant_type/client_id validation; the
 * shared try/catch there owns exception capture.
 */
export async function handleOidcRefreshTokenGrant(
  dbh: ServerlessDatabase,
  param: OidcTokenFormParam,
  client_app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean,
): Promise<NextResponse> {
  const refresh_token = param("refresh_token");
  if (!refresh_token) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'refresh_token' parameter.",
    );
  }

  // Locate + decode: keyset id and audience come from the token header;
  // refresh tokens are always signed with the auth server's own keyset.
  const auth_app_id = getAuthServerAppId();
  let decoded: CustomJWTPayload;
  try {
    const keyset_id: string = getKeysetIdFromToken(refresh_token);
    const token_audience: string = getAudienceFromToken(
      refresh_token,
      environment,
    );
    if (
      getApiServerIdForTokenAudience(token_audience, environment) !==
      auth_app_id
    ) {
      return oidcTokenErrorResponse(
        "invalid_grant",
        "Invalid refresh token audience.",
      );
    }
    const keyset: I_JWT_Keys = await new AuthServerJwtKeysManager(
      dbh.db,
    ).getKeyset(auth_app_id, keyset_id);
    decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys: keyset,
      env: environment,
    });
  } catch {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Invalid or expired refresh token.",
    );
  }

  // The refresh token must have been issued to this client...
  if (decoded.app !== client_app_id) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token was not issued to this client.",
    );
  }
  // ...by the OIDC surface (custom-surface refresh tokens carry no
  // scope claim and are not redeemable here).
  const original_scopes = parseAndGrantScopes(decoded.scope);
  if (!original_scopes.hasOpenid) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "This refresh token was not issued by the OIDC token endpoint.",
    );
  }

  // Revocation checks: explicit jti revocation (logout) plus the
  // per-user tokens_valid_after watermark (password reset).
  if (decoded.jti && (await isTokenRevoked(dbh.db, decoded.jti))) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token has been revoked.",
    );
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    decoded.uid,
  );
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token has been revoked.",
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);
  const user: UserData = await loadUserData(decoded.uid, userRegistry);
  if (user.disabled) {
    return oidcTokenErrorResponse("invalid_grant", "Account is disabled.");
  }
  const appAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    user.uid,
    client_app_id,
    debug,
  );
  if (!appAuthorized) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "The user has not authorized this client application.",
    );
  }

  // RFC 6749 §6: a scope re-request must be a subset of the original
  // grant; absent means "same as originally granted".
  let scope: string = original_scopes.granted.join(" ");
  const requested_scope = param("scope");
  if (requested_scope !== null) {
    const requested = parseAndGrantScopes(requested_scope);
    const isSubset = requested.granted.every((s) =>
      original_scopes.granted.includes(s),
    );
    if (!requested.hasOpenid || !isSubset) {
      return oidcTokenErrorResponse(
        "invalid_scope",
        "Requested scope exceeds the originally granted scope.",
      );
    }
    scope = requested.granted.join(" ");
  }

  const body = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: null,
    grant_type: "refresh_token",
    environment,
    // OIDC Core §12.2 permits omitting the id_token on refresh.
    include_id_token: false,
    debug,
  });
  return oidcTokenSuccessResponse(body);
}

export default handleOidcRefreshTokenGrant;
