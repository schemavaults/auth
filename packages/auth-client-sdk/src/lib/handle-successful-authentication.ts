import {
  type AccessToken,
  createAuthorizationCodePOSTBodySchema,
  PKCE_ProofKeyManager,
  type RefreshToken,
  createRequestTokensResultSchema,
  type UserData,
} from "@schemavaults/auth-common";
import debugPrintTokensAsTable from "./debugPrintTokensAsTable";
import debugPrintUserDataAsTable from "./debugPrintUserDataAsTable";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { z } from "zod";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "./assert-http-only-refresh-token-has-accompanying-expiry-marker";
import { timingSafeStringEqual } from "@schemavaults/auth-common";

export interface IHandleSuccessfulAuthenticationOpts {
  authorization_code: string;
  challenge_time: number;
  code_verifier?: string;
  // OAuth2 `state` parameter as received on the callback URL. The SDK
  // rejects the exchange if this does not match the value it persisted
  // before the authorize redirect.
  received_state: string | null | undefined;
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
   * custom value). Injected into audience schema validation because browser
   * bundles can't resolve the SCHEMAVAULTS_AUTH_SERVER_APP_ID env var.
   */
  auth_server_app_id?: AppId;
  defaultTokenAudiences: string | string[];
  // stores a refresh token locally (if http-only cookies not being used)
  storeRefreshToken: (refreshToken: RefreshToken) => void;
  storeUserData: (userData: UserData) => void;
  storeMultipleAccessTokens: (
    accessTokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">,
  ) => void;
  triggerAuthStateChanged: () => void;
}

export async function handleSuccessfulAuthentication({
  authorization_code,
  challenge_time,
  code_verifier,
  received_state,
  expected_nonce,
  redirect_uri,
  loadCodeVerifier,
  loadOAuth2State,
  loadOidcNonce,
  debug,
  environment,
  adapter,
  auth_server_url,
  auth_server_app_id,
  client_app_id,
  defaultTokenAudiences,
  storeRefreshToken,
  storeUserData,
  storeMultipleAccessTokens,
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
  // state or trade a victim's code.
  const isRedirectFlow: boolean =
    typeof code_verifier !== "string" || code_verifier.length === 0;
  if (isRedirectFlow) {
    let stored_state: string | null;
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
  // is redeemed, so the echo in the token response can be verified. In
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

  // Get the endpoint to exchange the authorization code for an access token
  // https://datatracker.ietf.org/doc/html/rfc7636#section-4.5
  const authorization_code_token_endpoint = new URL(
    `/api/auth/token/authorization_code/${client_app_id}` as const,
    auth_server_url,
  ).toString();
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Token Endpoint: ",
      authorization_code_token_endpoint,
    );
  }

  let audience: string | string[] = defaultTokenAudiences;
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Initial access token audience(s): ",
      audience,
    );
  }
  if (!audience || (Array.isArray(audience) && audience.length === 0)) {
    console.warn(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] No access token audience(s) set",
    );
    audience = [];
  }

  const authorizationCodePOSTBodySchema = createAuthorizationCodePOSTBodySchema(
    z,
    environment,
    { auth_server_url, auth_server_app_id },
  );

  // Exchange the authorization code for an access token
  let request_body: z.infer<typeof authorizationCodePOSTBodySchema>;
  try {
    const parsed = await authorizationCodePOSTBodySchema.safeParseAsync({
      grant_type: "authorization_code" as const,
      code: authorization_code,
      code_verifier: cached_code_verifier,
      client_app_id,
      audience,
      challenge_time,
      redirect_uri,
    } satisfies z.infer<typeof authorizationCodePOSTBodySchema>);
    if (!parsed.success) {
      throw parsed.error;
    }
    request_body = parsed.data;
  } catch (e: unknown) {
    console.error(
      "Failed to prepare request body for authorization grant request: ",
      e,
    );
    throw new Error(
      "Failed to prepare request body for authorization grant request",
    );
  }

  // Send the request to the auth server
  // The auth server will hash the code_verifier and compare it to the code_challenge

  let response: Response;
  try {
    if (debug) {
      console.log(
        `[SchemaVaultsAuthClient] Exchanging authorization code for access token; sending req body to token endpoint: "${authorization_code_token_endpoint}"`,
        request_body,
      );
    }
    response = await adapter.fetch(authorization_code_token_endpoint, {
      body: JSON.stringify(request_body),
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient] Received response in attempt to exchange authorization code for access token: ",
        response,
      );
    }
  } catch (e: unknown) {
    console.error("Failed to exchange authorization code for access token:", e);
    throw new Error("Failed to exchange authorization code for access token");
  }

  if (!response || !response.ok || response.status !== 200) {
    const errorMsg: string = `Failed to exchange authorization code for access token (status code: ${response.status})`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
        "Successfully exchanged authorization code for token(s)",
    );
  }

  let access_tokens: Record<ApiServerId, AccessToken | "AS_HTTP_ONLY_COOKIE">;
  let refresh_token: RefreshToken | "AS_HTTP_ONLY_COOKIE";
  let refresh_token_expiry: number | undefined;
  let user: UserData;
  try {
    const tokens_data = await createRequestTokensResultSchema(z, environment, {
      auth_server_url,
      auth_server_app_id,
    }).safeParseAsync(await response.json());
    if (!tokens_data.success) {
      console.error(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
          "Failed to parse tokens from auth server response:",
        tokens_data.error,
      );
      throw new Error("Failed to parse tokens from auth server response");
    } else if (!tokens_data.data.success) {
      throw new Error(tokens_data.data.message);
    }

    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] Success response data: ",
        tokens_data.data,
      );
    }

    // Login replay-nonce verification: the server echoes the nonce that
    // was bound to the redeemed authorization code at login time. A
    // missing or mismatched echo means the token response was not
    // produced for THIS flow's code — reject it.
    if (nonce_to_verify) {
      const echoed_nonce: string | undefined = tokens_data.data.nonce;
      if (
        typeof echoed_nonce !== "string" ||
        !timingSafeStringEqual(nonce_to_verify, echoed_nonce)
      ) {
        console.error(
          "[SchemaVaultsAuthClient::handleSuccessfulAuthentication()] " +
            "Login nonce mismatch in token response",
        );
        throw new Error(
          "Login nonce mismatch in token response — possible replay",
        );
      }
    }

    const { tokens, userData } = tokens_data.data;
    if (!tokens) {
      console.error("Did not receive tokens in response from auth server");
      throw new Error("Did not receive tokens in response from auth server");
    }

    if (!tokens.access) {
      console.error(
        "Did not receive any access tokens in response from auth server",
      );
      throw new Error(
        "Did not receive any access tokens in response from auth server",
      );
    }

    if (
      !tokens.refresh ||
      (typeof tokens.refresh !== "object" && typeof tokens.refresh !== "string")
    ) {
      console.error(
        "Did not receive (valid) refresh token in response from auth server.",
        `Type: ${typeof tokens.refresh}`,
        tokens.refresh,
      );
      throw new Error(
        "Did not receive refresh token in response from auth server",
      );
    }

    if (debug) {
      debugPrintTokensAsTable(tokens);
    }

    access_tokens = tokens.access;
    refresh_token = tokens.refresh;
    refresh_token_expiry = tokens.refresh_token_expiry;

    if (!userData) {
      console.error("Did not receive user data in response from auth server");
      throw new Error("Did not receive user data in response from auth server");
    } else {
      if (debug) {
        debugPrintUserDataAsTable(userData satisfies UserData);
      }
    }
    user = userData;
  } catch (e: unknown) {
    let errorMessage: string = "Unknown error";
    if (e instanceof Error) {
      errorMessage = e.message;
    }
    console.error("Failed to parse tokens response: ", errorMessage);
    throw new Error(`Failed to parse tokens response: ${errorMessage}`);
  }

  // Store refresh token
  const doStoreReceivedRefreshToken = () => {
    if (typeof refresh_token === "object" && refresh_token.type === "refresh") {
      refresh_token_expiry = refresh_token.exp;
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
      const supportsHttpOnlyRefreshTokenCookie: boolean =
        typeof adapter.doesSupportHttpOnlyRefreshToken === "function" &&
        adapter.doesSupportHttpOnlyRefreshToken();

      if (!supportsHttpOnlyRefreshTokenCookie) {
        throw new Error(
          "Received refresh token cookie 'AS_HTTP_ONLY_COOKIE', but this auth client instance's adapter does not support it!",
        );
      }

      if (typeof adapter.storeHttpOnlyRefreshTokenMarker !== "function") {
        throw new TypeError(
          "Expected auth client adapter to have method 'storeHttpOnlyRefreshTokenMarker'!",
        );
      }

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

  // Store access tokens
  storeMultipleAccessTokens(access_tokens);

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
