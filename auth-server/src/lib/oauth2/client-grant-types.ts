// client-grant-types.ts
//
// Which token-endpoint grants a client application may use. Apps created
// through the management console carry no registered grant types (their
// `grant_types` column is NULL) and may use every grant the token
// endpoint implements. A dynamically registered client (RFC 7591) is
// held to the `grant_types` it registered (RFC 7591 §2: the grant types
// "the client will restrict itself to using"); registration only accepts
// `authorization_code` and `refresh_token`, so such a client can never
// use the client_credentials or token exchange grants.

import {
  isDynamicallyRegisteredClient,
  type ResourceOwnershipFields,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { TOKEN_EXCHANGE_GRANT_TYPE } from "@/lib/oidc/token-exchange/token-exchange-constants";

/** The grants implemented by `POST /api/oidc/token`, as `grant_type` values. */
export const TOKEN_ENDPOINT_GRANT_TYPES = [
  "authorization_code",
  "refresh_token",
  "client_credentials",
  TOKEN_EXCHANGE_GRANT_TYPE,
] as const;

export type TokenEndpointGrantType = (typeof TOKEN_ENDPOINT_GRANT_TYPES)[number];

/**
 * Grants that mint tokens for the client's own service account, either as
 * the subject (client_credentials) or as the actor (token exchange): only
 * for managed apps, never for a dynamically registered client.
 */
const SERVICE_ACCOUNT_GRANT_TYPES: ReadonlySet<TokenEndpointGrantType> = new Set([
  "client_credentials",
  TOKEN_EXCHANGE_GRANT_TYPE,
]);

/** The token endpoint grant a `grant_type` value names, or null for any other value. */
export function parseTokenEndpointGrantType(
  value: string | null,
): TokenEndpointGrantType | null {
  return (TOKEN_ENDPOINT_GRANT_TYPES as readonly (string | null)[]).includes(value)
    ? (value as TokenEndpointGrantType)
    : null;
}

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
 *   grant, except that the client_credentials and token exchange grants are
 *   never available to a dynamically registered client (they mint tokens
 *   for a per-app service account, a managed-app feature), whatever its
 *   stored metadata says.
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
    SERVICE_ACCOUNT_GRANT_TYPES.has(grant_type) &&
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
