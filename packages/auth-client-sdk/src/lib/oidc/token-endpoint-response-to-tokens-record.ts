// token-endpoint-response-to-tokens-record.ts
//
// Translates an RFC 6749 §5.1 token response (as returned by
// openid-client) into the SDK's internal tokens record — the shape the
// adapters store and `acquireAccessToken` reads.

import {
  accessTokenExpiry,
  oidcTokenResponseExtensionsSchema,
  refreshTokenExpiry,
  type AccessToken,
  type RefreshToken,
  type SuccessfullyGeneratedTokensRecord,
} from "@schemavaults/auth-common";

/**
 * The subset of openid-client's `TokenEndpointResponse` the SDK reads.
 * Structurally typed so tests can build responses without the library.
 */
export interface OidcTokenEndpointResponseLike {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly id_token?: string;
  readonly scope?: string;
  readonly [parameter: string]: unknown;
}

export interface TokenEndpointResponseToTokensRecordOptions {
  response: OidcTokenEndpointResponseLike;
  /**
   * Token audience the response's access token was minted for: the
   * RFC 8707 `resource` sent with the request, or the reserved userinfo
   * audience when none was sent.
   */
  audience: string;
  /** The authenticated user's id (from the id_token / cached user data). */
  uid: string;
  /** Audience of the refresh token: the auth server URL. */
  auth_server_url: string;
  /** Clock override for tests (ms since epoch). */
  now?: number;
}

/**
 * Builds the SDK tokens record from a token response.
 *
 * - `access[audience]` is the response's `access_token`, expiring
 *   `expires_in` seconds from now.
 * - `refresh` is the inlined `refresh_token` when present; when the auth
 *   server delivered it as an HTTP-only cookie instead (platform
 *   `refresh_token_delivery=http_only_cookie` extension) the record
 *   carries `"AS_HTTP_ONLY_COOKIE"` plus `refresh_token_expiry`, derived
 *   from the `refresh_token_expires_in` extension field.
 */
export function tokenEndpointResponseToTokensRecord({
  response,
  audience,
  uid,
  auth_server_url,
  now = Date.now(),
}: TokenEndpointResponseToTokensRecordOptions): SuccessfullyGeneratedTokensRecord {
  if (typeof response.access_token !== "string" || !response.access_token) {
    throw new TypeError("Token response is missing 'access_token'!");
  }
  if (typeof response.token_type !== "string" || response.token_type.toLowerCase() !== "bearer") {
    throw new TypeError(
      `Unsupported token_type '${String(response.token_type)}' in token response; expected 'Bearer'`,
    );
  }
  if (typeof audience !== "string" || audience.length === 0) {
    throw new TypeError("Expected 'audience' to be a non-empty string!");
  }
  if (typeof uid !== "string" || uid.length === 0) {
    throw new TypeError("Expected 'uid' to be a non-empty string!");
  }

  const parsed_extensions = oidcTokenResponseExtensionsSchema.safeParse(response);
  if (!parsed_extensions.success) {
    throw new TypeError(
      "Token response carries malformed extension fields: " +
        parsed_extensions.error.issues.map((i) => i.message).join("; "),
    );
  }
  const refresh_token_expires_in: number | undefined =
    parsed_extensions.data.refresh_token_expires_in;

  const access_expires_in: number =
    typeof response.expires_in === "number" && response.expires_in > 0
      ? response.expires_in
      : accessTokenExpiry;

  const access: AccessToken = {
    type: "access",
    uid,
    iat: now,
    exp: now + access_expires_in * 1000,
    token: response.access_token,
    aud: audience,
  };

  const record: SuccessfullyGeneratedTokensRecord = {
    access: { [audience]: access },
  };

  if (typeof response.refresh_token === "string" && response.refresh_token) {
    const refresh: RefreshToken = {
      type: "refresh",
      uid,
      iat: now,
      exp: now + (refresh_token_expires_in ?? refreshTokenExpiry) * 1000,
      token: response.refresh_token,
      aud: auth_server_url,
    };
    record.refresh = refresh;
  } else if (typeof refresh_token_expires_in === "number") {
    record.refresh = "AS_HTTP_ONLY_COOKIE";
    record.refresh_token_expiry = now + refresh_token_expires_in * 1000;
  } else {
    throw new Error(
      "Token response included neither an inlined 'refresh_token' nor a 'refresh_token_expires_in' for a cookie-delivered refresh token!",
    );
  }

  return record;
}

export default tokenEndpointResponseToTokensRecord;
