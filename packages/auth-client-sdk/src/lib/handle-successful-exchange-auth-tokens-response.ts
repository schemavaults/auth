// handle-successful-exchange-auth-tokens-response.ts

import { z } from "zod";
import {
  type AccessToken,
  createSuccessfullyGeneratedTokensRecordSchema,
  type SuccessfullyGeneratedTokensRecord,
  type UserData,
} from "@schemavaults/auth-common";
import isSameUserData from "@/lib/is-same-user-data";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "@/lib/assert-http-only-refresh-token-has-accompanying-expiry-marker";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface IHandleSuccessfulExchangeAuthTokensResponseOpts {
  /** The tokens record built from the refresh grant response(s). */
  tokens: SuccessfullyGeneratedTokensRecord;
  debug: boolean;
  environment: SchemaVaultsAppEnvironment;
  adapter: ISchemaVaultsAuthClientAdapter;
  /**
   * The auth server URL and own-app id this client was configured with.
   * Injected into audience schema validation because browser bundles can't
   * resolve the SCHEMAVAULTS_AUTH_SERVER_URL / _APP_ID env vars (white-label
   * deployments would otherwise fail validation against the defaults).
   */
  auth_server_url?: string;
  auth_server_app_id?: AppId;
  storeMultipleAccessTokens: (
    access_tokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ) => void;
  /**
   * Re-loads the user's data from the auth server after the exchange.
   * The refresh grant loads user data fresh from the database when
   * minting tokens (server-side guards reading the rotated refresh
   * token see the new claims), and the whoami re-sync here propagates
   * claims that changed since login (e.g. `email_verified` after
   * completing email verification) to `currentUser` without requiring
   * a re-login. Failures are non-fatal: the tokens are already stored.
   */
  fetchUserData?: () => Promise<UserData | null>;
  storeUserData?: (userData: UserData) => void;
  /** Called after `storeUserData` when the cached user data actually changed. */
  triggerAuthStateChanged?: () => void;
}

export default async function handleSuccessfulExchangeAuthTokensResponse({
  tokens: unvalidated_tokens,
  debug,
  environment,
  auth_server_url,
  auth_server_app_id,
  storeMultipleAccessTokens,
  fetchUserData,
  storeUserData,
  triggerAuthStateChanged,
  adapter,
}: IHandleSuccessfulExchangeAuthTokensResponseOpts): Promise<SuccessfullyGeneratedTokensRecord> {
  const parsed_tokens = await createSuccessfullyGeneratedTokensRecordSchema(
    z,
    environment,
    { auth_server_url, auth_server_app_id },
  ).safeParseAsync(unvalidated_tokens);
  if (!parsed_tokens.success) {
    if (debug) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulExchangeAuthTokensResponse()] " +
          "Failed to validate exchange auth tokens result: ",
        parsed_tokens.error.issues,
      );
    }
    throw new Error("Failed to parse successful exchange auth tokens result!");
  }

  const tokens: SuccessfullyGeneratedTokensRecord = parsed_tokens.data;

  if (!tokens.access) {
    throw new Error("No access token was included in the tokens response");
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Successfully exchanged refresh token for new authentication token(s)",
    );
  }

  storeMultipleAccessTokens(tokens.access);

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

  if (typeof fetchUserData === "function" && typeof storeUserData === "function") {
    // Failures here must not fail the exchange itself — the tokens above are
    // already stored and usable.
    try {
      const fresh: UserData | null = await fetchUserData();
      if (fresh) {
        const previous: UserData | null = adapter.getUserData();
        const changed: boolean = !isSameUserData(previous, fresh);
        storeUserData(fresh);
        if (changed && typeof triggerAuthStateChanged === "function") {
          if (debug) {
            console.log(
              "[SchemaVaultsAuthClient] Cached user data changed after token exchange; triggering auth state change event...",
            );
          }
          triggerAuthStateChanged();
        }
      }
    } catch (e: unknown) {
      console.error(
        "[SchemaVaultsAuthClient] Failed to sync cached user data after token exchange: ",
        e,
      );
    }
  }

  return tokens;
}
