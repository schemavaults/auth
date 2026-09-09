import "server-only";

/**
 * Token-endpoint request extensions used by the SchemaVaults SDKs on top
 * of the standard OIDC surface (see `token-endpoint-extensions.ts` in
 * `@schemavaults/auth-common` for the wire contract):
 *
 *   - RFC 8707 `resource`: mint the access token for a registered API
 *     server / the auth server itself instead of the reserved
 *     `oidc-userinfo` audience.
 *   - `refresh_token_delivery`: deliver the refresh token as an HTTP-only
 *     cookie instead of inlining it in the JSON body.
 */

export type { OidcTokenRequestError } from "./oidc-token-request-error";

export { parseOidcTokenResourceParam } from "./parse-oidc-token-resource-param";
export type { ParsedOidcTokenResource } from "./parse-oidc-token-resource-param";

export { validateOidcTokenResource } from "./validate-oidc-token-resource";
export type { ValidateOidcTokenResourceOptions } from "./validate-oidc-token-resource";

export { parseOidcRefreshTokenDeliveryParam } from "./parse-oidc-refresh-token-delivery-param";
export type { ParsedOidcRefreshTokenDelivery } from "./parse-oidc-refresh-token-delivery-param";

export { resolveRefreshTokenDeliveryMode } from "./resolve-refresh-token-delivery-mode";
