// The OpenID Connect scope names, without zod: imported by the
// dependency-free `scopes/` module as well as `./scope`.

export const OIDC_OPENID_SCOPE = "openid" as const;

export const OIDC_SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

/**
 * The scope values OpenID Connect Core §5.4 / §11 standardize. No API
 * server may define one of them as an API scope (even those this server
 * does not support yet), so a granted scope string always splits
 * unambiguously into its OIDC part and its API part
 * (`partitionGrantedScopes`).
 */
export const OIDC_RESERVED_SCOPES = [
  "openid",
  "profile",
  "email",
  "address",
  "phone",
  "offline_access",
] as const;

export type OidcReservedScope = (typeof OIDC_RESERVED_SCOPES)[number];

export function isOidcReservedScope(scope: string): boolean {
  return (OIDC_RESERVED_SCOPES as readonly string[]).includes(scope);
}
