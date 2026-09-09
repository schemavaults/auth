/**
 * Token-endpoint request/response parameters used by the SchemaVaults
 * SDKs on top of the standard OIDC token endpoint (`/api/oidc/token`).
 *
 * The platform's SDK clients need two things a plain OIDC relying party
 * does not:
 *
 *   1. Access tokens for arbitrary registered API servers (the platform's
 *      authorization model is audience-based). This uses the STANDARD
 *      RFC 8707 `resource` parameter: the token endpoint mints the
 *      response's `access_token` for that audience instead of the
 *      reserved `oidc-userinfo` audience. Exactly one `resource` per
 *      token request (the platform issues one encrypted access token per
 *      audience, so it "only supports issuing an access token with a
 *      single audience" in RFC 8707 §2 terms).
 *
 *   2. Refresh tokens kept out of JavaScript for browser clients. This
 *      is a platform extension: the `refresh_token_delivery` request
 *      parameter asks the endpoint to set the refresh token as an
 *      HTTP-only cookie (scoped to the client app, on the auth server's
 *      domain) and OMIT `refresh_token` from the JSON body. RFC 6749
 *      §5.1 makes `refresh_token` OPTIONAL in the response, so
 *      spec-compliant client libraries (e.g. `openid-client`) accept
 *      such responses unchanged. The response always carries the
 *      extension field `refresh_token_expires_in` (seconds) so the client
 *      can track the session lifetime either way.
 *
 * Relying parties that send neither parameter get the plain OIDC
 * behavior (userinfo-audience access token, refresh token inlined).
 */

import { z } from "zod";

/** RFC 8707 Resource Indicators request parameter name. */
export const OIDC_TOKEN_RESOURCE_PARAM = "resource" as const;

/** Platform extension: how the refresh token is delivered to the client. */
export const OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM =
  "refresh_token_delivery" as const;

export const OIDC_REFRESH_TOKEN_DELIVERY_MODES = [
  /** RFC 6749 §5.1 default: `refresh_token` inlined in the JSON body. */
  "inline",
  /**
   * Refresh token set as an HTTP-only cookie (`refresh_token_<client_id>`
   * plus the JS-readable `refresh_token_expiry_<client_id>` marker) and
   * omitted from the JSON body.
   */
  "http_only_cookie",
] as const;

export const oidcRefreshTokenDeliveryModeSchema = z.enum(
  OIDC_REFRESH_TOKEN_DELIVERY_MODES,
);

export type OidcRefreshTokenDeliveryMode = z.infer<
  typeof oidcRefreshTokenDeliveryModeSchema
>;

export const DEFAULT_OIDC_REFRESH_TOKEN_DELIVERY_MODE =
  "inline" as const satisfies OidcRefreshTokenDeliveryMode;

/**
 * Platform extension response field: seconds until the (possibly
 * cookie-delivered) refresh token expires. Named after the widely used
 * non-standard field of the same name (GitHub, Keycloak's
 * `refresh_expires_in`, ...).
 */
export const OIDC_TOKEN_REFRESH_TOKEN_EXPIRES_IN_FIELD =
  "refresh_token_expires_in" as const;

/**
 * Shape of the extension fields the SDK reads off a token response.
 * `refresh_token_expires_in` is emitted by the auth server on every
 * successful response whose grant issued a refresh token.
 */
export const oidcTokenResponseExtensionsSchema = z
  .object({
    [OIDC_TOKEN_REFRESH_TOKEN_EXPIRES_IN_FIELD]: z
      .number()
      .int()
      .positive()
      .optional(),
  })
  .loose();

export type OidcTokenResponseExtensions = z.infer<
  typeof oidcTokenResponseExtensionsSchema
>;
