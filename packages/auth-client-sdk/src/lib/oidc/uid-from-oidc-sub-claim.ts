// uid-from-oidc-sub-claim.ts
//
// Resolves the platform user id from an OIDC id_token `sub` claim.

import { parseOidcSubClaim } from "@schemavaults/auth-common";

/**
 * Resolves the platform user id from an id_token's `sub` claim, which the
 * auth server namespaces as `<auth_server_app_id>|<uid>` (Auth0-style).
 *
 * The prefix is NOT required to match `expected_auth_server_app_id`:
 * the id_token's `iss` claim (verified by openid-client against the
 * configured auth server URL) already pins the deployment, and external
 * resource servers commonly leave `auth_server_app_id` at its default
 * even against white-label auth servers. A mismatch is only surfaced as
 * a warning in debug mode.
 */
export function uidFromOidcSubClaim(
  sub: unknown,
  expected_auth_server_app_id: string,
  debug: boolean = false,
): string {
  if (typeof sub !== "string" || sub.length === 0) {
    throw new TypeError("id_token is missing its 'sub' claim!");
  }
  const parsed = parseOidcSubClaim(sub);
  if (!parsed) {
    throw new Error("id_token 'sub' claim is not in '<app_id>|<uid>' form!");
  }
  if (debug && parsed.auth_server_app_id !== expected_auth_server_app_id) {
    console.warn(
      `[SchemaVaultsAuthClient] id_token 'sub' claim is namespaced by '${parsed.auth_server_app_id}', ` +
        `but this client is configured with auth_server_app_id '${expected_auth_server_app_id}'. ` +
        "Pass the deployment's SCHEMAVAULTS_AUTH_SERVER_APP_ID as 'auth_server_app_id' when initializing the client.",
    );
  }
  return parsed.uid;
}

export default uidFromOidcSubClaim;
