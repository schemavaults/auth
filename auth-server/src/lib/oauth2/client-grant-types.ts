// client-grant-types.ts
//
// Which token-endpoint grants a client application may use. Apps created
// through the management console carry no registered grant types (their
// `grant_types` column is NULL) and may use every grant the token
// endpoint implements. A dynamically registered client (RFC 7591) is
// held to the `grant_types` it registered (RFC 7591 §2: the grant types
// "the client will restrict itself to using"); registration only accepts
// `authorization_code` and `refresh_token`, so such a client can never
// use the client_credentials grant.

import {
  isDynamicallyRegisteredClient,
  type ResourceOwnershipFields,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";

/** The grants implemented by `POST /api/oidc/token`. */
export type TokenEndpointGrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials";

export type ClientAppGrantTypePolicyFields = Pick<
  SchemaVaultsApp,
  "grant_types"
> &
  ResourceOwnershipFields;

/**
 * @description Whether `client_app` may use `grant_type` at the token
 * endpoint (RFC 6749 §5.2 `unauthorized_client` otherwise).
 *
 * - No registered grant types (console-created and hardcoded apps): every
 *   grant, except that the client_credentials grant is never available to
 *   a dynamically registered client (it mints tokens for a per-app service
 *   account, a managed-app feature), whatever its stored metadata says.
 * - Registered grant types: only those. `refresh_token` is also allowed
 *   whenever `authorization_code` is registered: the authorization code
 *   grant issues a refresh token to every client, and RFC 7591's default
 *   (`["authorization_code"]`, which most registrations store) would
 *   otherwise strand the refresh tokens such clients already hold.
 *   Redeeming one only continues a grant the user already made.
 */
export function isGrantTypeAllowedForClientApp(
  client_app: ClientAppGrantTypePolicyFields,
  grant_type: TokenEndpointGrantType,
): boolean {
  if (
    grant_type === "client_credentials" &&
    isDynamicallyRegisteredClient(client_app)
  ) {
    return false;
  }
  const registered: readonly string[] | null | undefined =
    client_app.grant_types;
  if (registered === null || registered === undefined) {
    return true;
  }
  if (registered.includes(grant_type)) {
    return true;
  }
  return (
    grant_type === "refresh_token" && registered.includes("authorization_code")
  );
}

export default isGrantTypeAllowedForClientApp;
