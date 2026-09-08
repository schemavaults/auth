// exchange-auth-tokens.ts
//
// Redeems a refresh token at the auth server's standard OIDC token
// endpoint (/api/oidc/token, grant_type=refresh_token) via
// `openid-client`. The endpoint mints ONE access token per request
// (RFC 8707 `resource`), so a multi-audience exchange is a sequence of
// refresh grants — each rotating the refresh token, so each subsequent
// grant presents the token the previous one returned.

import * as oidc from "openid-client";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type AccessToken,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  OIDC_TOKEN_RESOURCE_PARAM,
  type RefreshToken,
  type SuccessfullyGeneratedTokensRecord,
  type UserData,
} from "@schemavaults/auth-common";
import {
  classifyOidcTokenError,
  createOidcClientConfiguration,
  normalizeOidcIssuer,
  tokenEndpointResponseToTokensRecord,
} from "./oidc";

export interface IExchangeAuthTokensOpts {
  refreshToken: RefreshToken | "AS_HTTP_ONLY_COOKIE";
  /**
   * Audience(s) to mint access tokens for. An empty list is a
   * rotation-only request: the refresh token is rotated (and user data
   * re-synced) without minting an access token for any API server.
   */
  audience: string | string[];
  auth_server_uri: string;
  /**
   * The auth server deployment's own app id (white-label deployments use a
   * custom value). Kept for parity with the code-grant path.
   */
  auth_server_app_id?: AppId;
  environment: SchemaVaultsAppEnvironment;
  debug: boolean;
  client_app_id: AppId;
  adapter: ISchemaVaultsAuthClientAdapter;
  /**
   * Loads the signed-in user's data from the auth server (whoami) using
   * the currently stored refresh token. Used to resolve the user id for
   * the token record when no user data is cached yet.
   */
  fetchUserData: () => Promise<UserData | null>;
  handleSuccessfulExchangeAuthTokensResponse: (
    tokens: SuccessfullyGeneratedTokensRecord,
  ) => Promise<SuccessfullyGeneratedTokensRecord>;
  logout: () => Promise<void>;
}

function normalizeAudiences(audience: string | string[]): string[] {
  if (Array.isArray(audience)) {
    return audience.filter(
      (a): a is string => typeof a === "string" && a.length > 0,
    );
  }
  return typeof audience === "string" && audience.length > 0 ? [audience] : [];
}

export async function exchangeAuthTokens({
  refreshToken,
  audience,
  debug,
  environment,
  auth_server_uri,
  client_app_id,
  adapter,
  fetchUserData,
  handleSuccessfulExchangeAuthTokensResponse,
  logout,
}: IExchangeAuthTokensOpts): Promise<SuccessfullyGeneratedTokensRecord> {
  void environment;
  if (debug) {
    console.log(
      "[SchemaVaultsAuthClient] Attempting to send request to exchange refresh token for access token...",
    );
  }

  if (!refreshToken) {
    throw new Error(
      "Did not receive a refresh token to exchange for access token!",
    );
  }

  // ---- Which refresh token, and how is it presented? -----------------
  let useHttpOnlyCookie: boolean;
  if (typeof refreshToken === "object" && refreshToken.type === "refresh") {
    if (
      typeof refreshToken.token !== "string" ||
      refreshToken.token.length === 0
    ) {
      throw new TypeError("Expected 'token' to be a non-empty string!");
    }
    useHttpOnlyCookie = false;
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
    useHttpOnlyCookie = true;
  } else {
    throw new Error(
      "Did not receive a valid refresh token (or valid method of acquiring refresh token)",
    );
  }

  // ---- Resolve the user id for the token record ----------------------
  // The refresh grant response carries no id_token (OIDC Core §12.2), so
  // the subject comes from the cached user data — or, on a cold cache,
  // from the auth server's whoami endpoint (authenticated with the
  // refresh token we are about to rotate).
  let uid: string | undefined = adapter.getUserData()?.uid;
  if (!uid) {
    const user: UserData | null = await fetchUserData();
    if (!user) {
      await logout();
      throw new Error("Session expired: the auth server no longer recognizes this session");
    }
    uid = user.uid;
  }

  // ---- The grant(s) --------------------------------------------------
  const config: oidc.Configuration = createOidcClientConfiguration({
    auth_server_url: auth_server_uri,
    client_app_id,
    adapter,
  });
  const issuer: string = normalizeOidcIssuer(auth_server_uri);

  // An empty audience list is a rotation-only request: one grant with no
  // `resource` (its access token is for the reserved userinfo audience).
  const audiences: (string | null)[] = normalizeAudiences(audience);
  const grants: (string | null)[] = audiences.length > 0 ? audiences : [null];

  const access: Record<string, AccessToken> = {};
  let current: RefreshToken | "AS_HTTP_ONLY_COOKIE" = refreshToken;
  let last_record: SuccessfullyGeneratedTokensRecord | undefined;

  for (const resource of grants) {
    const parameters = new URLSearchParams();
    if (resource) {
      parameters.set(OIDC_TOKEN_RESOURCE_PARAM, resource);
    }
    if (useHttpOnlyCookie) {
      parameters.set(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM, "http_only_cookie");
    }

    if (debug) {
      console.log(
        "[SchemaVaultsAuthClient::exchangeAuthTokens()] " +
          `Sending refresh grant to "${config.serverMetadata().token_endpoint}" with parameters:`,
        Object.fromEntries(parameters.entries()),
        useHttpOnlyCookie
          ? "(refresh token presented via HTTP-only cookie)"
          : "(refresh token presented inline)",
      );
    }

    let response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      if (useHttpOnlyCookie) {
        // The refresh token lives in the auth server's HTTP-only cookie,
        // which the adapter's fetch sends with the request; the form
        // therefore carries no `refresh_token` parameter.
        response = await oidc.genericGrantRequest(
          config,
          "refresh_token",
          parameters,
        );
      } else {
        if (typeof current !== "object") {
          throw new Error(
            "Refresh token rotation switched to cookie delivery mid-exchange",
          );
        }
        response = await oidc.refreshTokenGrant(
          config,
          current.token,
          parameters,
        );
      }
    } catch (e: unknown) {
      const classified = classifyOidcTokenError(e);
      if (debug) {
        console.error("[exchangeAuthTokens] Refresh grant failed: ", e);
      }
      if (classified.session_lost) {
        console.error(
          `Refresh grant rejected by the auth server (${classified.message}); client is no longer logged in.`,
        );
        await logout();
        // Downstream handlers (acquire-access-token.ts, etc.) detect an
        // unrecoverable session by the "expired" keyword in the message.
        throw new Error("Refresh token has expired!", { cause: e });
      }
      throw new Error(`Token exchange failed: ${classified.message}`, {
        cause: e,
      });
    }

    let record: SuccessfullyGeneratedTokensRecord;
    try {
      record = tokenEndpointResponseToTokensRecord({
        response,
        audience: resource ?? OIDC_USERINFO_AUDIENCE_ID,
        uid,
        auth_server_url: issuer,
      });
    } catch (e: unknown) {
      console.error("Failed to parse tokens response from server: ", e);
      throw new Error("Failed to parse tokens response from server!", {
        cause: e,
      });
    }

    Object.assign(access, record.access ?? {});
    if (typeof record.refresh === "object") {
      // Rotation: the next grant must present the replacement token.
      current = record.refresh;
    }
    last_record = record;
  }

  if (!last_record) {
    throw new Error("No refresh grant was performed");
  }

  const merged: SuccessfullyGeneratedTokensRecord = {
    access,
    refresh: last_record.refresh,
    ...(typeof last_record.refresh_token_expiry === "number"
      ? { refresh_token_expiry: last_record.refresh_token_expiry }
      : {}),
  };

  try {
    return await handleSuccessfulExchangeAuthTokensResponse(merged);
  } catch (e: unknown) {
    if (debug) {
      console.error(
        "Failed to store authentication tokens from refresh grant: ",
        e,
      );
    }
    throw new Error(
      "Failed to parse authentication tokens from exchange tokens POST request!",
      { cause: e },
    );
  }
}

export default exchangeAuthTokens;
