import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import exchangeAuthTokens from "./exchange-auth-tokens";
import {
  classifyOidcTokenError,
  TokenEndpointRequestFailedError,
} from "./oidc";
import {
  isTokenEndpointRequestFailedError,
  resolveLoginErrorPage,
} from "./login-error-page";

const NOT_CONNECTED_DESCRIPTION =
  "The client application is not connected to the requested API server.";

/**
 * Runs a refresh grant against a token endpoint that answers `status` with
 * `body`, returning what exchangeAuthTokens throws.
 */
async function failedRefreshGrant(
  status: number,
  body: Record<string, unknown>,
): Promise<{ error: unknown; loggedOut: boolean }> {
  let loggedOut = false;
  const adapter = {
    fetch: async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    getUserData: () => ({ uid: "00000000-0000-4000-8000-000000000000" }),
  } as unknown as ISchemaVaultsAuthClientAdapter;
  try {
    await exchangeAuthTokens({
      refreshToken: {
        type: "refresh",
        token: "refresh.jwt",
      } as Parameters<typeof exchangeAuthTokens>[0]["refreshToken"],
      audience: "schemavaults-registry",
      auth_server_uri: "https://auth.example.com",
      environment: "development",
      debug: false,
      client_app_id: "my-app",
      adapter,
      fetchUserData: async () => null,
      handleSuccessfulExchangeAuthTokensResponse: async (tokens) => tokens,
      logout: async () => {
        loggedOut = true;
      },
    });
  } catch (error: unknown) {
    return { error, loggedOut };
  }
  throw new Error("expected exchangeAuthTokens to fail");
}

describe("TokenEndpointRequestFailedError", () => {
  test("a refused audience keeps the session and carries the OAuth error", async () => {
    const { error, loggedOut } = await failedRefreshGrant(400, {
      error: "invalid_target",
      error_description: NOT_CONNECTED_DESCRIPTION,
    });
    expect(loggedOut).toBe(false);
    expect(error).toBeInstanceOf(TokenEndpointRequestFailedError);
    const failure = error as TokenEndpointRequestFailedError;
    expect(failure.oauth_error).toBe("invalid_target");
    expect(failure.error_description).toBe(NOT_CONNECTED_DESCRIPTION);
    expect(failure.status).toBe(400);
    expect(failure.session_lost).toBe(false);
    // The message keeps its pre-existing shape.
    expect(failure.message).toBe(
      `Token exchange failed: invalid_target: ${NOT_CONNECTED_DESCRIPTION} (HTTP 400)`,
    );
  });
});

describe("resolveLoginErrorPage", () => {
  test("invalid_target (app not connected to the API server)", async () => {
    const { error } = await failedRefreshGrant(400, {
      error: "invalid_target",
      error_description: NOT_CONNECTED_DESCRIPTION,
    });
    expect(resolveLoginErrorPage(error)).toEqual({
      error_id: "app_not_connected_to_api_server",
      error_code: 403,
    });
  });

  test("looks through the cause chain", async () => {
    const { error } = await failedRefreshGrant(400, {
      error: "invalid_target",
      error_description: NOT_CONNECTED_DESCRIPTION,
    });
    const wrapped = new Error(
      "Failed to exchange authorization code for refresh token using auth client!",
      {
        cause: new Error(
          "Failed to acquire access tokens for the remaining default audiences",
          { cause: error },
        ),
      },
    );
    expect(resolveLoginErrorPage(wrapped).error_id).toBe(
      "app_not_connected_to_api_server",
    );
  });

  test("other token endpoint refusals keep their HTTP status", () => {
    const failure = new TokenEndpointRequestFailedError(
      "Failed to exchange authorization code for access token: invalid_grant (HTTP 400)",
      {
        error: "invalid_grant",
        error_description: null,
        status: 400,
        session_lost: true,
        message: "invalid_grant (HTTP 400)",
      },
    );
    expect(resolveLoginErrorPage(failure)).toEqual({
      error_id: "login_failure",
      error_code: 400,
    });
  });

  test("errors without a token endpoint answer are a generic login failure", () => {
    const failure = new TokenEndpointRequestFailedError(
      "Failed to exchange authorization code for access token: network down",
      classifyOidcTokenError(new Error("network down")),
    );
    expect(resolveLoginErrorPage(failure)).toEqual({
      error_id: "login_failure",
      error_code: 500,
    });
    expect(resolveLoginErrorPage(new Error("Code verifier has expired"))).toEqual(
      { error_id: "login_failure", error_code: 500 },
    );
    expect(resolveLoginErrorPage("???")).toEqual({
      error_id: "login_failure",
      error_code: 500,
    });
  });

  test("recognizes the error thrown by another copy of the SDK", () => {
    const foreign = Object.assign(new Error("Token exchange failed"), {
      name: "TokenEndpointRequestFailedError",
      oauth_error: "invalid_target",
      error_description: null,
      status: 400,
      session_lost: false,
    });
    expect(isTokenEndpointRequestFailedError(foreign)).toBe(true);
    expect(resolveLoginErrorPage(foreign).error_id).toBe(
      "app_not_connected_to_api_server",
    );
    expect(isTokenEndpointRequestFailedError(new Error("x"))).toBe(false);
  });
});
