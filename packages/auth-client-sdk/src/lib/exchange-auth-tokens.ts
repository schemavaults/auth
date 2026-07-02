import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type RefreshToken,
  createRefreshTokenPOSTBodySchema,
  type RequestTokensResult,
  createRequestTokensResultSchema,
  type SuccessfullyGeneratedTokensRecord,
} from "@schemavaults/auth-common";
import { z } from "zod";

export interface IExchangeAuthTokensOpts {
  refreshToken: RefreshToken | "AS_HTTP_ONLY_COOKIE";
  audience: string | string[];
  replaceRefreshToo?: boolean;
  auth_server_uri: string;
  environment: SchemaVaultsAppEnvironment;
  debug: boolean;
  client_app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
  handleSuccessfulExchangeAuthTokensResponse: (
    response: RequestTokensResult,
  ) => Promise<SuccessfullyGeneratedTokensRecord>;
  logout: () => Promise<void>;
}

export async function exchangeAuthTokens({
  refreshToken,
  audience,
  replaceRefreshToo,
  debug,
  environment,
  auth_server_uri,
  client_app_id,
  adapter,
  handleSuccessfulExchangeAuthTokensResponse,
  logout,
}: IExchangeAuthTokensOpts): Promise<SuccessfullyGeneratedTokensRecord> {
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Attempting to send request to exchange refresh token for access token...",
    );
  }

  const exchange_refresh_token_endpoint = new URL(
    `/api/auth/token/refresh_token/${client_app_id}` as const,
    auth_server_uri,
  );

  if (!audience && !replaceRefreshToo) {
    throw new Error("Type of token to acquire not specified");
  }

  const refreshTokenPOSTBodySchema = createRefreshTokenPOSTBodySchema(
    z,
    environment,
  );

  // Exchange the authorization code for an access token
  let request_body: z.infer<typeof refreshTokenPOSTBodySchema>;
  try {
    const parsed = await refreshTokenPOSTBodySchema.safeParseAsync({
      grant_type: "refresh_token" as const,
      client_app_id,
      audience: audience,
      replaceRefreshToo: replaceRefreshToo ?? false,
    } satisfies z.infer<typeof refreshTokenPOSTBodySchema>);
    if (!parsed.success) {
      console.error(parsed.error);
      throw new Error(
        "Failed to parse tokens from exchange auth tokens POST request!",
      );
    }
    request_body = parsed.data;
  } catch (e: unknown) {
    if (debug) {
      console.error(
        "Failed to prepare request body for authorization grant request: ",
        e,
      );
    }
    throw new Error(
      "Failed to prepare request body for authorization grant request",
    );
  }

  const exchangeAuthTokensReqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!refreshToken) {
    throw new Error(
      "Did not receive a refresh token to exchange for access token!",
    );
  }

  if (typeof refreshToken === "object" && refreshToken.type === "refresh") {
    if (
      typeof refreshToken.token !== "string" ||
      refreshToken.token.length === 0
    ) {
      throw new TypeError("Expected 'token' to be a non-empty string!");
    }

    exchangeAuthTokensReqHeaders["Authorization"] =
      `Bearer ${refreshToken.token}`;
  } else if (
    typeof refreshToken === "string" &&
    refreshToken === "AS_HTTP_ONLY_COOKIE"
  ) {
    if (typeof adapter.doesSupportHttpOnlyRefreshToken !== "function") {
      throw new TypeError(
        "Adapter does not support HTTP-only refresh tokens! Missing 'doesSupportHttpOnlyRefreshToken' method on adapter interface!",
      );
    }
    if (!adapter.doesSupportHttpOnlyRefreshToken()) {
      throw new Error(
        "Adapter does not support HTTP-only refresh tokens! Adapter method 'doesSupportHttpOnlyRefreshToken' returned falsy result!",
      );
    }
  } else {
    throw new Error(
      "Did not receive a valid refresh token (or valid method of acquiring refresh token)",
    );
  }

  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient::exchangeAuthTokens()] " +
        `Sending POST request to "${exchange_refresh_token_endpoint.toString()}" with body & headers:`,
      request_body,
      exchangeAuthTokensReqHeaders,
    );
  }

  let tokens_response_data: RequestTokensResult;
  try {
    if (debug) {
      console.log(`POST => ${exchange_refresh_token_endpoint}`);
    }
    const response: Response = await adapter.fetch(
      exchange_refresh_token_endpoint.toString(),
      {
        body: JSON.stringify(request_body),
        method: "POST",
        headers: exchangeAuthTokensReqHeaders,
        credentials: "include",
      },
    );
    if (!response || typeof response !== "object" || response.status !== 200) {
      let serverMessage = "unknown error";
      try {
        const errorBody: unknown = await response.json();
        if (
          errorBody &&
          typeof errorBody === "object" &&
          "message" in errorBody &&
          typeof (errorBody as { message: unknown }).message === "string"
        ) {
          serverMessage = (errorBody as { message: string }).message;
        }
      } catch {
        // Response body may not be valid JSON
      }

      if (response.status === 403 || response.status === 401) {
        console.error(
          `${response.status} error response from exchange token attempt, client is not logged in! Server: ${serverMessage}`,
        );
        await logout();
        const sessionExpiredMsg = `Session expired (HTTP ${response.status}): ${serverMessage}`;
        // Guard: downstream error handlers (acquire-access-token.ts, etc.) detect session
        // expiry by checking if the error message includes "expired". If the message format
        // is ever refactored and that keyword is accidentally removed, the entire expired-session
        // detection chain breaks silently. This check ensures the contract is always upheld.
        if (!sessionExpiredMsg.toLowerCase().includes("expired")) {
          throw new Error("Session expired");
        }
        throw new Error(sessionExpiredMsg);
      }
      throw new Error(
        `Token exchange failed (HTTP ${response.status}): ${serverMessage}`,
      );
    }

    const parsed_tokens_result = await createRequestTokensResultSchema(
      z,
      environment,
    ).safeParseAsync(await response.json());
    if (!parsed_tokens_result.success) {
      console.error(
        "Failed to parse tokens response from server: ",
        parsed_tokens_result.error,
      );
      throw new Error("Failed to parse tokens response from server!");
    }

    tokens_response_data = parsed_tokens_result.data;
  } catch (e: unknown) {
    if (debug) {
      console.error("[exchangeAuthTokens] FETCH FAILED: ", e);
    }

    if (e instanceof Error) {
      const eMsg: string = e.message.toLowerCase();
      if (
        eMsg.includes("expired") ||
        eMsg.includes("jwtexpired") ||
        eMsg.includes("err_jwt_expired")
      ) {
        console.error("Refresh token appears to have expired!");
        throw new Error("Refresh token has expired!");
      }
    }

    throw e instanceof Error
      ? e
      : new Error("Failed to exchange refresh token for access token");
  }

  try {
    // Parse tokens from response JSON body
    return await handleSuccessfulExchangeAuthTokensResponse(
      tokens_response_data,
    );
  } catch (e: unknown) {
    if (debug) {
      console.log("typeof e === ", typeof e);
      if (e instanceof Error) {
        console.error("Parse tokens error message: ", e.message);
      }
      console.error(
        "Failed to parse authentication tokens from exchange tokens POST request: ",
        e,
      );
    }
    throw new Error(
      "Failed to parse authentication tokens from exchange tokens POST request!",
    );
  }
}

export default exchangeAuthTokens;
