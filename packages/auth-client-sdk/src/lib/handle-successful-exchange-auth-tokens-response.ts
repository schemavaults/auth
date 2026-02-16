// handle-successful-exchange-auth-tokens-response.ts

import {
  type AccessToken,
  type RequestTokensResult,
  requestTokensResultSchema,
  type SuccessfullyGeneratedTokensRecord,
} from "@schemavaults/auth-common";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "@/lib/assert-http-only-refresh-token-has-accompanying-expiry-marker";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type { ApiServerId } from "@schemavaults/app-definitions";

export interface IHandleSuccessfulExchangeAuthTokensResponseOpts {
  tokens_response: unknown;
  debug: boolean;
  adapter: ISchemaVaultsAuthClientAdapter;
  storeMultipleAccessTokens: (
    access_tokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ) => void;
}

export default async function handleSuccessfulExchangeAuthTokensResponse({
  tokens_response,
  debug,
  storeMultipleAccessTokens,
  adapter,
}: IHandleSuccessfulExchangeAuthTokensResponseOpts): Promise<SuccessfullyGeneratedTokensRecord> {
  const parsed_tokens_data =
    await requestTokensResultSchema.safeParseAsync(tokens_response);
  if (!parsed_tokens_data.success) {
    if (debug) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulExchangeAuthTokensResponse()] " +
          "Failed to parse successful exchange auth tokens result: ",
        parsed_tokens_data.error.errors,
      );
    }
    throw new Error("Failed to parse successful exchange auth tokens result!");
  }

  const request_tokens_result: RequestTokensResult = parsed_tokens_data.data;

  if (!request_tokens_result.success) {
    throw new Error("Request tokens response has success === false");
  }

  const tokens: SuccessfullyGeneratedTokensRecord | undefined =
    request_tokens_result.tokens;

  if (!tokens) {
    throw new Error("Response did not include any tokens");
  }

  if (!tokens.access) {
    throw new Error("No access token was included in the tokens response");
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Successfully exchanged refresh token for new authentication token(s)",
    );
  }

  if (tokens.access) {
    storeMultipleAccessTokens(tokens.access);
  }

  if (tokens.refresh) {
    if (
      typeof tokens.refresh === "object" &&
      tokens.refresh.type === "refresh"
    ) {
      if (
        typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
        adapter.doesSupportHttpOnlyRefreshToken()
      ) {
        throw new Error(
          "Received a RefreshToken object, but this client should use HTTP-only cookies to store refresh token!",
        );
      }
      adapter.storeRefreshToken(tokens.refresh);
    } else if (
      typeof tokens.refresh === "string" &&
      tokens.refresh === "AS_HTTP_ONLY_COOKIE"
    ) {
      const supportsHttpOnlyRefreshTokenCookie: boolean =
        typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
        adapter.doesSupportHttpOnlyRefreshToken();

      if (!supportsHttpOnlyRefreshTokenCookie) {
        throw new Error(
          "Received refresh token cookie 'AS_HTTP_ONLY_COOKIE', but this auth client instance's adapter does not support it!",
        );
      }

      if (typeof tokens.refresh_token_expiry !== "number") {
        throw new TypeError(
          "Expected 'refresh_token_expiry' to be a number if refresh token was passed as HTTP-only cookie!",
        );
      }

      if (typeof adapter.storeHttpOnlyRefreshTokenMarker !== "function") {
        throw new TypeError(
          "Expected auth client adapter to have method 'storeHttpOnlyRefreshTokenMarker'!",
        );
      }

      adapter.storeHttpOnlyRefreshTokenMarker(
        tokens.refresh_token_expiry satisfies number,
      ) satisfies void;

      assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie(
        adapter,
      ) satisfies void;
      if (debug) {
        console.log(
          "[SchemaVaultsAuthClient] Detected HTTP-only cookie refresh token from exchange response.",
        );
      }
    } else {
      throw new TypeError("Invalid refresh token type");
    }
  }

  return tokens;
}
