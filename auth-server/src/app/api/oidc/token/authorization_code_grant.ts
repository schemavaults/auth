import "server-only";
import type { NextResponse } from "next/server";
import {
  PKCE_ProofKeyManager,
  type UserData,
} from "@schemavaults/auth-common";
import { UserRegistry, loadUserData } from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
} from "@/lib/oidc/token-request-extensions";
import type { OidcGrantContext, OidcGrantOutcome } from "./token-response";

/**
 * grant_type=authorization_code (RFC 6749 §4.1.3 / OIDC Core §3.1.3):
 * consumes a one-time authorization code under PKCE + client +
 * redirect_uri binding and issues the OIDC token set (access + refresh
 * + id_token). Called from route.ts after grant_type/client_id
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

  if (resource !== null) {
    const resourceError = await validateOidcTokenResource({
      uid: user.uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    });
    if (resourceError) {
      return fail(
        oidcTokenErrorResponse(
          resourceError.error,
          resourceError.error_description,
        ),
      );
    }
  }

  const scope: string = consumed.scope || "openid";
  const issued = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: consumed.nonce,
    grant_type: "authorization_code",
    environment,
    include_id_token: true,
    access_token_audience: resource ?? undefined,
    debug,
  });
  return { ok: true, issued };
}

export default handleOidcAuthorizationCodeGrant;
