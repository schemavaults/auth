import "server-only";
import type { NextResponse } from "next/server";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  PKCE_ProofKeyManager,
  type UserData,
} from "@schemavaults/auth-common";
import { UserRegistry, loadUserData, type ServerlessDatabase } from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  oidcTokenSuccessResponse,
  type OidcTokenFormParam,
} from "./token-response";

/**
 * grant_type=authorization_code (RFC 6749 §4.1.3 / OIDC Core §3.1.3):
 * consumes a one-time authorization code under PKCE + client +
 * redirect_uri binding and issues the OIDC token set (access + refresh
 * + id_token). Called from route.ts after grant_type/client_id
 * validation; the shared try/catch there owns exception capture.
 */
export async function handleOidcAuthorizationCodeGrant(
  dbh: ServerlessDatabase,
  param: OidcTokenFormParam,
  client_app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean,
): Promise<NextResponse> {
  const code = param("code");
  const redirect_uri = param("redirect_uri");
  const code_verifier = param("code_verifier");
  if (!code) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'code' parameter.",
    );
  }
  if (!redirect_uri) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'redirect_uri' parameter.",
    );
  }
  if (
    !code_verifier ||
    !PKCE_ProofKeyManager.codeVerifierSchema.safeParse(code_verifier).success
  ) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing or malformed 'code_verifier' parameter (PKCE is required).",
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);

  // challenge_time is passed as null: standard RPs never see that
  // SDK-internal value, so the redemption uses the one stored on the
  // code row at issuance (it does not feed the PKCE hash).
  const consumed = await userRegistry.validateAndConsumeAuthorizationCode(
    code,
    client_app_id,
    code_verifier,
    null,
    redirect_uri,
  );
  if (!consumed) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Invalid, expired, or already-used authorization code (or PKCE/redirect_uri mismatch).",
    );
  }

  const user: UserData = await loadUserData(consumed.uid, userRegistry);
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

  const scope: string = consumed.scope || "openid";
  const body = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: consumed.nonce,
    grant_type: "authorization_code",
    environment,
    include_id_token: true,
    debug,
  });
  return oidcTokenSuccessResponse(body);
}

export default handleOidcAuthorizationCodeGrant;
