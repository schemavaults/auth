import "server-only";
import type { NextResponse } from "next/server";
import {
  PKCE_ProofKeyManager,
  parseAndGrantScopes,
  type UserData,
} from "@schemavaults/auth-common";
import {
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  loadUserData,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
} from "@/lib/oidc/token-request-extensions";
import type { ApiServerId } from "@schemavaults/app-definitions";
import type { OidcGrantContext, OidcGrantOutcome } from "./token-response";

/**
 * grant_type=authorization_code (RFC 6749 §4.1.3 / OIDC Core §3.1.3):
 * consumes a one-time authorization code under PKCE + client +
 * redirect_uri binding and issues the token set: access + refresh, plus
 * an id_token iff the code's granted scope includes `openid` (a code
 * minted for a plain OAuth 2.1 grant carries a null scope and gets no
 * id_token — OIDC Core §3.1.3.3 only applies to OpenID requests).
 * Called from route.ts after grant_type/client_id
 * validation and client authentication; the shared try/catch there
 * owns exception capture, and route.ts delivers the issued tokens.
 */
export async function handleOidcAuthorizationCodeGrant({
  dbh,
  form,
  param,
  client_app_id,
  environment,
  debug,
}: OidcGrantContext): Promise<OidcGrantOutcome> {
  const fail = (response: NextResponse): OidcGrantOutcome => ({
    ok: false,
    response,
  });

  const code = param("code");
  // RFC 6749 §4.1.3: `redirect_uri` is REQUIRED iff it was included in
  // the authorization request. The code row records the value bound at
  // issuance (null for the auth server's own first-party login flow,
  // which never redirects through a third-party callback), and code
  // consumption enforces exact equality — including null-vs-string.
  const redirect_uri = param("redirect_uri");
  const code_verifier = param("code_verifier");
  if (!code) {
    return fail(
      oidcTokenErrorResponse("invalid_request", "Missing 'code' parameter."),
    );
  }
  if (
    !code_verifier ||
    !PKCE_ProofKeyManager.codeVerifierSchema.safeParse(code_verifier).success
  ) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_request",
        "Missing or malformed 'code_verifier' parameter (PKCE is required).",
      ),
    );
  }

  // RFC 8707 resource indicator (validated for the user+client below,
  // once the code has identified the user).
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
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Invalid, expired, or already-used authorization code (or PKCE/redirect_uri mismatch).",
      ),
    );
  }

  // The code was minted by an authenticated session (the guarded
  // generate-authorization-code route). If that session was revoked after
  // the code was minted — a password reset bumps the user's
  // tokens_valid_after watermark, logout does too — the code must not be
  // redeemable: the tokens it would mint carry a fresh `iat` past the
  // watermark and would launder the dead session into a fully valid one.
  // Same strict less-than / unix-seconds semantics as the refresh grant.
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    consumed.uid,
  );
  if (
    isTokenIatRevoked(Math.floor(consumed.created_at / 1000), tokens_valid_after)
  ) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Authorization code was issued to a session that has since been revoked.",
      ),
    );
  }

  const user: UserData = await loadUserData(consumed.uid, userRegistry);
  if (user.disabled) {
    return fail(
      oidcTokenErrorResponse("invalid_grant", "Account is disabled."),
    );
  }
  const appAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    user.uid,
    client_app_id,
    debug,
  );
  if (!appAuthorized) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "The user has not authorized this client application.",
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

  // A null stored scope is a plain OAuth 2.1 grant (nothing granted):
  // the tokens carry no scope claim and no id_token is minted.
  const scope: string = consumed.scope ?? "";
  const issued = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: consumed.nonce,
    grant_type: "authorization_code",
    environment,
    include_id_token: parseAndGrantScopes(scope).hasOpenid,
    access_token_audience,
    access_token_audience_api_server_id,
    debug,
  });
  return { ok: true, issued };
}

export default handleOidcAuthorizationCodeGrant;
