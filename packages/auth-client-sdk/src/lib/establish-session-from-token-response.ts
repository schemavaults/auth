// establish-session-from-token-response.ts
//
// The second half of every sign-in that ends at the token endpoint (the
// authorization code grant of handleSuccessfulAuthentication(), the device
// authorization grant of signInWithDeviceAuthorization()): translates the
// token response, stores the refresh token and access token(s) through the
// platform adapter, acquires access tokens for the remaining default
// audiences, syncs the user data and announces the new auth state.

import type * as oidc from "openid-client";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  type ApiServerId,
  type AppId,
} from "@schemavaults/app-definitions";
import type {
  AccessToken,
  RefreshToken,
  SuccessfullyGeneratedTokensRecord,
  UserData,
} from "@schemavaults/auth-common";
import debugPrintTokensAsTable from "./debugPrintTokensAsTable";
import debugPrintUserDataAsTable from "./debugPrintUserDataAsTable";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "./assert-http-only-refresh-token-has-accompanying-expiry-marker";
import { tokenEndpointResponseToTokensRecord, uidFromOidcSubClaim } from "./oidc";

export interface EstablishSessionFromTokenResponseOpts {
  /** The token response of the sign-in's grant; it must carry an id_token. */
  tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  /** The RFC 8707 `resource` the grant's access token was minted for, if any. */
  first_audience: string | undefined;
  /** Further default audiences, acquired through refresh grants afterwards. */
  remaining_audiences: readonly string[];
  /** Whether the grant asked for the refresh token as an HTTP-only cookie. */
  wantsHttpOnlyRefreshTokenCookie: boolean;
  /** The auth server's issuer identifier (the refresh token's audience). */
  issuer: string;
  /** The auth server's own app id, which namespaces the id_token `sub`. */
  auth_server_app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
  debug: boolean;
  storeRefreshToken: (refreshToken: RefreshToken) => void;
  storeMultipleAccessTokens: (
    accessTokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ) => void;
  exchangeAuthTokens: (
    refreshToken: RefreshToken | "AS_HTTP_ONLY_COOKIE",
    audience: string | string[],
  ) => Promise<SuccessfullyGeneratedTokensRecord>;
  fetchUserData: () => Promise<UserData | null>;
  storeUserData: (userData: UserData) => void;
  /** Called once the session is stored; an error it throws is logged and ignored. */
  onSessionEstablished?: () => void;
  triggerAuthStateChanged: () => void;
}

/**
 * Stores the session a token response establishes. Throws when the
 * response lacks an id_token, a refresh token or an access token, or when
 * the user data the auth server returns afterwards belongs to another
 * subject.
 */
export async function establishSessionFromTokenResponse({
  tokens,
  first_audience,
  remaining_audiences,
  wantsHttpOnlyRefreshTokenCookie,
  issuer,
  auth_server_app_id,
  adapter,
  debug,
  storeRefreshToken,
  storeMultipleAccessTokens,
  exchangeAuthTokens,
  fetchUserData,
  storeUserData,
  onSessionEstablished,
  triggerAuthStateChanged,
}: EstablishSessionFromTokenResponseOpts): Promise<void> {
  // ---- Translate the token response ------------------------------------
  let record: SuccessfullyGeneratedTokensRecord;
  let uid: string;
  try {
    const claims: oidc.IDToken | undefined = tokens.claims();
    if (!claims) {
      throw new Error("Token response did not include an id_token");
    }
    uid = uidFromOidcSubClaim(claims.sub, auth_server_app_id, debug);
    record = tokenEndpointResponseToTokensRecord({
      response: tokens,
      audience: first_audience ?? OIDC_USERINFO_AUDIENCE_ID,
      uid,
      auth_server_url: issuer,
    });
    if (debug) {
      debugPrintTokensAsTable(record);
    }
  } catch (e: unknown) {
    let errorMessage: string = "Unknown error";
    if (e instanceof Error) {
      errorMessage = e.message;
    }
    console.error("Failed to parse tokens response: ", errorMessage);
    throw new Error(`Failed to parse tokens response: ${errorMessage}`);
  }

  const access_tokens = record.access;
  if (!access_tokens) {
    throw new Error(
      "Did not receive any access tokens in response from auth server",
    );
  }
  const refresh_token: RefreshToken | "AS_HTTP_ONLY_COOKIE" | undefined =
    record.refresh;
  if (!refresh_token) {
    throw new Error(
      "Did not receive refresh token in response from auth server",
    );
  }

  // ---- Store refresh token -------------------------------------------
  const doStoreReceivedRefreshToken = () => {
    if (typeof refresh_token === "object" && refresh_token.type === "refresh") {
      try {
        if (debug) {
          console.log("[SchemaVaultsAuthClient] Storing refresh token...");
        }
        storeRefreshToken(refresh_token);
        if (debug) {
          console.log("[SchemaVaultsAuthClient] Stored refresh token!");
        }
      } catch (e: unknown) {
        console.error(e);
        throw new Error("Failed to store refresh token");
      }
    } else if (
      typeof refresh_token === "string" &&
      refresh_token === "AS_HTTP_ONLY_COOKIE"
    ) {
      if (!wantsHttpOnlyRefreshTokenCookie) {
        throw new Error(
          "Received refresh token cookie 'AS_HTTP_ONLY_COOKIE', but this auth client instance's adapter does not support it!",
        );
      }

      if (typeof adapter.storeHttpOnlyRefreshTokenMarker !== "function") {
        throw new TypeError(
          "Expected auth client adapter to have method 'storeHttpOnlyRefreshTokenMarker'!",
        );
      }

      const refresh_token_expiry: number | undefined =
        record.refresh_token_expiry;
      if (typeof refresh_token_expiry !== "number") {
        throw new TypeError(
          "Expected 'refresh_token_expiry' to be a number if refresh token was passed as HTTP-only cookie!",
        );
      }

      adapter.storeHttpOnlyRefreshTokenMarker(
        refresh_token_expiry satisfies number,
      ) satisfies void;

      assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie(
        adapter,
      ) satisfies void;

      if (debug) {
        console.log(
          "[SchemaVaultsAuthClient] Detected HTTP-only cookie refresh token (accompanying-cookie).",
        );
      }
      return;
    } else {
      throw new TypeError("Invalid type for refresh token!");
    }
  };
  doStoreReceivedRefreshToken();

  // ---- Store access token(s) -----------------------------------------
  storeMultipleAccessTokens(access_tokens);

  if (remaining_audiences.length > 0) {
    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient] Acquiring access tokens for remaining default audiences via refresh grant(s): ",
        remaining_audiences,
      );
    }
    try {
      await exchangeAuthTokens(refresh_token, [...remaining_audiences]);
    } catch (e: unknown) {
      console.error(
        "[SchemaVaultsAuthClient] Failed to acquire access tokens for remaining default audiences: ",
        e,
      );
      throw new Error(
        "Failed to acquire access tokens for the remaining default audiences",
        { cause: e },
      );
    }
  }

  // ---- User data -----------------------------------------------------
  let user: UserData | null;
  try {
    user = await fetchUserData();
  } catch (e: unknown) {
    console.error("Failed to load user data after login: ", e);
    throw new Error("Failed to load user data after login", { cause: e });
  }
  if (!user) {
    console.error("Did not receive user data from auth server after login");
    throw new Error("Did not receive user data from auth server after login");
  }
  if (user.uid !== uid) {
    throw new Error(
      "User data returned by the auth server does not belong to the authenticated subject",
    );
  }
  if (debug) {
    debugPrintUserDataAsTable(user satisfies UserData);
  }

  try {
    if (debug) {
      console.log("[SchemaVaultsAuthClient] Storing user data...");
    }
    storeUserData(user);
    if (debug) {
      console.log("[SchemaVaultsAuthClient] Stored user data.");
    }
  } catch (e: unknown) {
    console.error("Failed to store user data: ", e);
    throw new Error("Failed to store user data");
  }

  // Best effort: the session is already stored, so a failing hook must not
  // fail the sign-in (at worst the session is later asked to authorize again).
  try {
    onSessionEstablished?.();
  } catch (e: unknown) {
    console.error(
      "[SchemaVaultsAuthClient] onSessionEstablished failed after the session was stored: ",
      e,
    );
  }

  if (debug) {
    console.log("[SchemaVaultsAuthClient] Triggering auth state changed!");
  }
  triggerAuthStateChanged();
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Finished triggering auth state change.",
    );
  }
}

export default establishSessionFromTokenResponse;
