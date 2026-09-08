// handle-successful-authentication.ts
//
// Redeems an authorization code at the auth server's standard OIDC token
// endpoint (/api/oidc/token) via `openid-client`, then stores the
// resulting refresh token, access token(s) and user data through the
// platform adapter.

import * as oidc from "openid-client";
import {
  type AccessToken,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  OIDC_TOKEN_RESOURCE_PARAM,
  PKCE_ProofKeyManager,
  type RefreshToken,
  type SuccessfullyGeneratedTokensRecord,
  type UserData,
  timingSafeStringEqual,
} from "@schemavaults/auth-common";
import {
  DEFAULT_AUTH_SERVER_APP_ID,
  OIDC_USERINFO_AUDIENCE_ID,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import debugPrintTokensAsTable from "./debugPrintTokensAsTable";
import debugPrintUserDataAsTable from "./debugPrintUserDataAsTable";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "./assert-http-only-refresh-token-has-accompanying-expiry-marker";
import {
  classifyOidcTokenError,
  createOidcClientConfiguration,
  normalizeOidcIssuer,
  tokenEndpointResponseToTokensRecord,
  uidFromOidcSubClaim,
} from "./oidc";

export interface IHandleSuccessfulAuthenticationOpts {
  authorization_code: string;
  challenge_time: number;
  code_verifier?: string;
  // OAuth2 `state` parameter as received on the callback URL. The SDK
  // rejects the exchange if this does not match the value it persisted
  // before the authorize redirect.
  received_state: string | null | undefined;
  // RFC 9207 `iss` parameter as received on the callback URL (redirect
  // flow). openid-client verifies it against the configured issuer,
  // defending against authorization-server mix-up attacks.
  received_iss: string | null | undefined;
  // Expected login replay nonce for flows completed in the same JS
  // context that initiated them (the auth server's own /account flow,
  // where no adapter storage round-trip happens). Ignored in the
  // redirect flow, which loads its stored nonce via `loadOidcNonce`.
  expected_nonce: string | null | undefined;
  // OAuth2 `redirect_uri` that was sent at issuance. The token endpoint
  // verifies this matches the value persisted on the authorization
  // code's row by exact string equality — refusing to swap a code's
  // redirect_uri between issuance and redemption. `null` for the auth
  // server's own /account flow.
  redirect_uri: string | null;
  loadCodeVerifier: (challenge_time: number) => string | null;
  loadOAuth2State: (challenge_time: number) => string | null;
  loadOidcNonce: (challenge_time: number) => string | null;
  debug: boolean;
  environment: SchemaVaultsAppEnvironment;
  adapter: ISchemaVaultsAuthClientAdapter;
  client_app_id: AppId;
  auth_server_url: string;
  /**
   * The auth server deployment's own app id (white-label deployments use a
   * custom value). The id_token `sub` claim is namespaced by it.
   */
  auth_server_app_id?: AppId;
  defaultTokenAudiences: string | string[];
  // stores a refresh token locally (if http-only cookies not being used)
  storeRefreshToken: (refreshToken: RefreshToken) => void;
  storeUserData: (userData: UserData) => void;
  storeMultipleAccessTokens: (
    accessTokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ) => void;
  /**
   * Redeems the (just stored) refresh token for access tokens of further
   * audiences. The token endpoint issues one access token per request,
   * so default audiences beyond the first are acquired here through
   * refresh grants right after the code grant.
   */
  exchangeAuthTokens: (
    refreshToken: RefreshToken | "AS_HTTP_ONLY_COOKIE",
    audience: string | string[],
  ) => Promise<SuccessfullyGeneratedTokensRecord>;
  /**
   * Loads the signed-in user's data from the auth server (whoami) using
   * the stored refresh token. The OIDC token response carries identity
   * claims only; the platform's full `UserData` comes from here.
   */
  fetchUserData: () => Promise<UserData | null>;
  triggerAuthStateChanged: () => void;
}

export async function handleSuccessfulAuthentication({
  authorization_code,
  challenge_time,
  code_verifier,
  received_state,
  received_iss,
  expected_nonce,
  redirect_uri,
  loadCodeVerifier,
  loadOAuth2State,
  loadOidcNonce,
  debug,
  environment,
  adapter,
  auth_server_url,
  auth_server_app_id = DEFAULT_AUTH_SERVER_APP_ID,
  client_app_id,
  defaultTokenAudiences,
  storeRefreshToken,
  storeUserData,
  storeMultipleAccessTokens,
  exchangeAuthTokens,
  fetchUserData,
  triggerAuthStateChanged,
}: IHandleSuccessfulAuthenticationOpts) {
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication]" +
        " " +
        "Handling successful authentication...",
    );
  }

  if (!authorization_code) {
    throw new Error("Missing authorization code");
  } else if (
    typeof authorization_code !== "string" ||
    authorization_code.length === 0
  ) {
    throw new TypeError(
      "Expected 'authorization_code' to be a non-empty string!",
    );
  }

  if (!challenge_time || typeof challenge_time !== "number") {
    throw new Error("Invalid challenge_time");
  }

  const time_elapsed_since_challenge_time = Date.now() - challenge_time;
  if (time_elapsed_since_challenge_time <= 0) {
    throw new Error("Expected challenge time to be in the past");
  }

  if (time_elapsed_since_challenge_time > PKCE_ProofKeyManager.max_age) {
    console.error(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication] Code verifier has expired based on challenge time",
    );
    if (debug) {
      try {
        console.table({
          challenge_time,
          current_time: Date.now(),
          time_elapsed: time_elapsed_since_challenge_time,
          max_age: PKCE_ProofKeyManager.max_age,
        });
      } catch (e: unknown) {
        void e; /** no-op */
      }
    }
    throw new Error("Code verifier has expired");
  }

  // OAuth2 `state` CSRF validation (RFC 6749 §10.12). Applies only to the
  // redirect flow — when `code_verifier` is passed directly the caller is
  // completing the flow in the same JS context that initiated it (e.g. the
  // auth server's own /account login), so there is no cross-origin
  // callback to defend against. In the redirect flow the verifier is
  // loaded from storage below and the state check MUST run before any
  // code redemption so a mismatched callback can never burn the stored
  // state or trade a victim's code. (openid-client repeats the check
  // when it validates the authorization response.)
  const isRedirectFlow: boolean =
    typeof code_verifier !== "string" || code_verifier.length === 0;
  let stored_state: string | null = null;
  if (isRedirectFlow) {
    try {
      stored_state = loadOAuth2State(challenge_time);
    } catch (e: unknown) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication] Failed to load stored OAuth2 state: ",
        e,
      );
      throw new Error("Failed to load stored OAuth2 state");
    }
    if (typeof stored_state !== "string" || stored_state.length === 0) {
      throw new Error(
        "Missing stored OAuth2 state — cannot verify callback CSRF nonce",
      );
    }
    if (typeof received_state !== "string" || received_state.length === 0) {
      throw new Error(
        "Missing OAuth2 state on callback — possible CSRF attempt",
      );
    }
    if (!timingSafeStringEqual(stored_state, received_state)) {
      if (debug) {
        console.error(
          "[SchemaVaultsAuthClient::handleSuccessfulAuthentication] OAuth2 state mismatch",
          {
            stored_state_length: stored_state.length,
            received_state_length: received_state.length,
          },
        );
      }
      throw new Error("OAuth2 state mismatch — possible CSRF attempt");
    }
  }

  // Load the stored login replay nonce (redirect flow) BEFORE the code
  // is redeemed, so the id_token's `nonce` claim can be verified. In
  // the same-context flow the caller passes `expected_nonce` directly.
  let nonce_to_verify: string | null = expected_nonce ?? null;
  if (isRedirectFlow) {
    let stored_nonce: string | null;
    try {
      stored_nonce = loadOidcNonce(challenge_time);
    } catch (e: unknown) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication] Failed to load stored login nonce: ",
        e,
      );
      throw new Error("Failed to load stored login nonce");
    }
    if (typeof stored_nonce !== "string" || stored_nonce.length === 0) {
      throw new Error(
        "Missing stored login nonce — cannot verify token response",
      );
    }
    nonce_to_verify = stored_nonce;
  }

  // The auth server will redirect the user back to the client
  // The client will have a code in the query parameters
  // The client will use the code to get an access token
  // PKCE: The client will use the code_verifier to prove that it is the same client

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] " +
        "Attempting to load code verifier to prove authorization code validity...",
    );
  }

  const cached_code_verifier: string | null =
    code_verifier ?? loadCodeVerifier(challenge_time);
  if (!cached_code_verifier) {
    const errorMessage: string = `[SchemaVaultsAuthClient] Failed to load code_verifier at challenge_time=${challenge_time}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  cached_code_verifier satisfies string;

  const shouldClearCodeVerifierAfterLoad: boolean =
    environment !== "development";

  if (shouldClearCodeVerifierAfterLoad) {
    // Clear the code verifier from storage
    try {
      if (debug) {
        console.log(
          "[SchemaVaultsAuthClient] " +
            "Code verifier was retrieved from storage, now clearing code verifier at challenge time: ",
          challenge_time,
        );
      }
      adapter.clearCodeVerifier(challenge_time);
      if (debug) {
        console.log(
          "[SchemaVaultsAuthClient] Cleared code verifiers from storage",
        );
      }
    } catch (e: unknown) {
      console.error(
        "[SchemaVaultsAuthClient] Failed to clear code verifiers: ",
        e,
      );
      if (debug) {
        throw new Error("Failed to clear code verifiers");
      }
    }

    // Clear the OAuth2 state + login nonce — they have done their job.
    // Only applies in the redirect flow where they were persisted.
    if (isRedirectFlow) {
      try {
        adapter.clearOAuth2State(challenge_time);
      } catch (e: unknown) {
        console.error(
          "[SchemaVaultsAuthClient] Failed to clear OAuth2 state: ",
          e,
        );
        if (debug) {
          throw new Error("Failed to clear OAuth2 state");
        }
      }
      try {
        adapter.clearOidcNonce(challenge_time);
      } catch (e: unknown) {
        console.error(
          "[SchemaVaultsAuthClient] Failed to clear login nonce: ",
          e,
        );
        if (debug) {
          throw new Error("Failed to clear login nonce");
        }
      }
    }
  } else {
    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient] Not attempting to clear code verifiers in this app environment...",
      );
    }
  }

  // ---- Token audiences ------------------------------------------------
  //
  // The standard token endpoint mints ONE access token per request
  // (RFC 8707 `resource`). The code grant carries the first default
  // audience; any further default audiences are acquired right after
  // through refresh grants. A client with no default audiences
  // exchanges the code for a refresh token + user data only (the access
  // token minted alongside is for the reserved userinfo audience).
  const audiences: string[] = Array.isArray(defaultTokenAudiences)
    ? [...defaultTokenAudiences]
    : typeof defaultTokenAudiences === "string" &&
        defaultTokenAudiences.length > 0
      ? [defaultTokenAudiences]
      : [];
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Default access token audience(s): ",
      audiences,
    );
  }
  const first_audience: string | undefined = audiences[0];
  const remaining_audiences: string[] = audiences.slice(1);

  const wantsHttpOnlyRefreshTokenCookie: boolean =
    typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
    adapter.doesSupportHttpOnlyRefreshToken();

  const token_endpoint_parameters = new URLSearchParams();
  if (first_audience) {
    token_endpoint_parameters.set(OIDC_TOKEN_RESOURCE_PARAM, first_audience);
  }
  if (wantsHttpOnlyRefreshTokenCookie) {
    token_endpoint_parameters.set(
      OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
      "http_only_cookie",
    );
  }

  // ---- Code redemption via openid-client ------------------------------
  const config: oidc.Configuration = createOidcClientConfiguration({
    auth_server_url,
    client_app_id,
    adapter,
  });
  const issuer: string = normalizeOidcIssuer(auth_server_url);

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Token Endpoint: ",
      config.serverMetadata().token_endpoint,
    );
  }

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    if (isRedirectFlow) {
      if (typeof redirect_uri !== "string" || redirect_uri.length === 0) {
        throw new Error(
          "Cannot redeem an authorization code from a redirect callback without the 'redirect_uri' it was issued for (is 'authorize_uri' configured?)",
        );
      }
      // Reconstruct the authorization response URL openid-client
      // validates (RFC 6749 §4.1.2 + RFC 9207): the redirect_uri the code
      // was issued for, plus the `code`, `state` and `iss` parameters the
      // auth server appended to it.
      const callback_url = new URL(redirect_uri);
      callback_url.searchParams.set("code", authorization_code);
      callback_url.searchParams.set("state", stored_state as string);
      if (typeof received_iss === "string" && received_iss.length > 0) {
        callback_url.searchParams.set("iss", received_iss);
      } else {
        // Callers that predate the `received_iss` argument cannot forward
        // the callback's `iss`. The configured issuer is substituted so the
        // exchange still proceeds under the (already verified) state + PKCE
        // bindings — equivalent to the pre-openid-client SDK, which never
        // checked `iss`. Forward it to get the mix-up defense.
        if (debug) {
          console.warn(
            "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] No 'iss' callback parameter supplied; skipping RFC 9207 issuer check",
          );
        }
        callback_url.searchParams.set("iss", issuer);
      }

      tokens = await oidc.authorizationCodeGrant(
        config,
        callback_url,
        {
          pkceCodeVerifier: cached_code_verifier,
          expectedState: stored_state as string,
          // Always a string in the redirect flow (validated above): the
          // id_token MUST carry the matching `nonce` claim.
          expectedNonce: nonce_to_verify as string,
          idTokenExpected: true,
        },
        token_endpoint_parameters,
      );
    } else {
      // Same-context flow (the auth server's own login page): the code
      // was returned directly by the auth server's login API, so there
      // is no callback URL / redirect_uri to validate. Redeem it with a
      // plain authorization_code grant; openid-client still validates
      // the id_token's iss/aud/exp, and the nonce is checked below.
      const parameters = new URLSearchParams(token_endpoint_parameters);
      parameters.set("code", authorization_code);
      parameters.set("code_verifier", cached_code_verifier);
      tokens = await oidc.genericGrantRequest(
        config,
        "authorization_code",
        parameters,
      );
      const claims: oidc.IDToken | undefined = tokens.claims();
      if (!claims) {
        throw new Error("Token response did not include an id_token");
      }
      if (nonce_to_verify) {
        const echoed_nonce: unknown = claims.nonce;
        if (
          typeof echoed_nonce !== "string" ||
          !timingSafeStringEqual(nonce_to_verify, echoed_nonce)
        ) {
          console.error(
            "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
              "Login nonce mismatch in id_token",
          );
          throw new Error(
            "Login nonce mismatch in token response — possible replay",
          );
        }
      }
    }
  } catch (e: unknown) {
    const classified = classifyOidcTokenError(e);
    console.error(
      "Failed to exchange authorization code for access token:",
      classified.message,
    );
    if (debug) {
      console.error(e);
    }
    throw new Error(
      `Failed to exchange authorization code for access token: ${classified.message}`,
      { cause: e },
    );
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
        "Successfully exchanged authorization code for token(s)",
    );
  }

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
      await exchangeAuthTokens(refresh_token, remaining_audiences);
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

  if (debug) {
    console.log("[SchemaVaultsAuthClient] Triggering auth state changed!");
  }
  triggerAuthStateChanged();
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Finished triggering auth state change.",
    );
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] handleSuccessfulAuthentication success!",
    );
  }
  return;
}

export default handleSuccessfulAuthentication;
