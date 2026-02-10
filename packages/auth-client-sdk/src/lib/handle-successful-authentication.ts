import {
  type AccessToken,
  authorizationCodePOSTbody,
  PKCE_ProofKeyManager,
  type RefreshToken,
  requestTokensResultSchema,
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
import type { z } from "zod";
import assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie from "./assert-http-only-refresh-token-has-accompanying-expiry-marker";

export interface IHandleSuccessfulAuthenticationOpts {
  authorization_code: string;
  challenge_time: number;
  code_verifier?: string;
  loadCodeVerifier: (challenge_time: number) => string | null;
  debug: boolean;
  environment: SchemaVaultsAppEnvironment;
  adapter: ISchemaVaultsAuthClientAdapter;
  client_app_id: AppId;
  auth_server_uri: string;
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
  loadCodeVerifier,
  debug,
  environment,
  adapter,
  auth_server_uri,
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
  } else {
    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient] Not attempting to clear code verifiers in this app environment...",
      );
    }
  }

  // Get the endpoint to exchange the authorization code for an access token
  // https://datatracker.ietf.org/doc/html/rfc7636#section-4.5
  const authorization_code_token_endpoint =
    `${auth_server_uri}/api/auth/token/authorization_code/${client_app_id}` as const;
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

  // Exchange the authorization code for an access token
  let request_body: z.infer<typeof authorizationCodePOSTbody>;
  try {
    const parsed = await authorizationCodePOSTbody.safeParseAsync({
      grant_type: "authorization_code" as const,
      code: authorization_code,
      code_verifier: cached_code_verifier,
      client_app_id,
      audience,
      challenge_time,
    } satisfies z.infer<typeof authorizationCodePOSTbody>);
    if (!parsed.success) throw parsed.error;
    request_body = parsed.data;
  } catch (e: unknown) {
    console.error(e);
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
    const tokens_data = await requestTokensResultSchema.safeParseAsync(
      await response.json(),
    );
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
      if (
        typeof adapter.storeHttpOnlyRefreshTokenMarker === "function" &&
        typeof refresh_token_expiry === "function"
      ) {
        adapter.storeHttpOnlyRefreshTokenMarker(refresh_token_expiry);
      }
      assertHttpOnlyRefreshTokenCookieHasAccompanyingMarkerCookie(adapter);
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
