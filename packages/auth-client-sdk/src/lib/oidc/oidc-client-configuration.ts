// oidc-client-configuration.ts
//
// Builds the `openid-client` Configuration the SDK uses to talk to the
// auth server's standard OIDC surface (/api/oidc/*). The server metadata
// is assembled statically from the endpoint paths shared with the auth
// server via @schemavaults/auth-common (the same constants the server's
// /.well-known/openid-configuration document is generated from), so no
// discovery round trip is needed on every client instantiation.

import * as oidc from "openid-client";
import {
  getOidcEndpointUrl,
  OIDC_SUPPORTED_SCOPES,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export interface CreateOidcClientConfigurationOptions {
  /**
   * The auth server URL — its OIDC issuer identifier, byte-identical to
   * the `iss` claim of the id_tokens it mints.
   */
  auth_server_url: string;
  /** The OAuth2 client_id: this client application's app id. */
  client_app_id: string;
  /** Platform adapter supplying the fetch implementation. */
  adapter: ISchemaVaultsAuthClientAdapter;
  /** Timeout for token-endpoint requests, in seconds (default 30). */
  timeout_seconds?: number;
}

/** Strips a trailing slash so the issuer matches `getAuthServerUrl()`. */
export function normalizeOidcIssuer(auth_server_url: string): string {
  if (typeof auth_server_url !== "string" || auth_server_url.length === 0) {
    throw new TypeError("Expected 'auth_server_url' to be a non-empty string!");
  }
  return auth_server_url.endsWith("/")
    ? auth_server_url.slice(0, -1)
    : auth_server_url;
}

/**
 * Server metadata for the auth server at `issuer`, mirroring what its
 * discovery document advertises. Exported for tests.
 */
export function buildAuthServerOidcMetadata(
  issuer: string,
): oidc.ServerMetadata {
  return {
    issuer,
    authorization_endpoint: getOidcEndpointUrl(issuer, "authorization"),
    token_endpoint: getOidcEndpointUrl(issuer, "token"),
    userinfo_endpoint: getOidcEndpointUrl(issuer, "userinfo"),
    introspection_endpoint: getOidcEndpointUrl(issuer, "introspection"),
    jwks_uri: getOidcEndpointUrl(issuer, "jwks"),
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: [...OIDC_SUPPORTED_SCOPES],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
    ],
    code_challenge_methods_supported: ["S256"],
    // RFC 9207: the auth server puts `iss` on every authorization
    // response, so openid-client requires and verifies it on redirect
    // callbacks (authorization-server mix-up protection).
    authorization_response_iss_parameter_supported: true,
  };
}

/**
 * Creates the openid-client Configuration for this SDK instance.
 *
 * - Public client: PKCE S256 is the binding, token endpoint auth method
 *   `none` (the platform never puts client secrets in browsers).
 * - HTTP requests go through the adapter's fetch so each platform
 *   (browser, Node, React Native) supplies its own implementation.
 *   Token-endpoint requests are sent with `credentials: "include"` so
 *   the auth server's HTTP-only refresh-token cookie travels with the
 *   refresh grant and the `Set-Cookie` on the response is honored.
 * - Plain-HTTP issuers (local dev / the docker-compose test network)
 *   are allowed; openid-client refuses non-TLS endpoints otherwise.
 */
export function createOidcClientConfiguration({
  auth_server_url,
  client_app_id,
  adapter,
  timeout_seconds,
}: CreateOidcClientConfigurationOptions): oidc.Configuration {
  const issuer: string = normalizeOidcIssuer(auth_server_url);
  const server: oidc.ServerMetadata = buildAuthServerOidcMetadata(issuer);
  const token_endpoint: string = server.token_endpoint as string;

  const config = new oidc.Configuration(
    server,
    client_app_id,
    { token_endpoint_auth_method: "none" },
    oidc.None(),
  );

  if (issuer.startsWith("http://")) {
    oidc.allowInsecureRequests(config);
  }
  if (typeof timeout_seconds === "number") {
    config.timeout = timeout_seconds;
  }

  config[oidc.customFetch] = async (
    url: string,
    options: oidc.CustomFetchOptions,
  ): Promise<Response> => {
    const isTokenEndpoint: boolean = url === token_endpoint;
    return await adapter.fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: options.redirect,
      signal: options.signal,
      credentials: isTokenEndpoint ? "include" : "same-origin",
    });
  };

  return config;
}

export default createOidcClientConfiguration;
