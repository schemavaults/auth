// oidc-client-configuration.ts
//
// Builds the `openid-client` Configuration the SDK uses to talk to the
// auth server's standard OIDC surface (/api/oidc/*). The server metadata
// is the auth server's own discovery document, built locally from the
// shared `buildOidcProviderMetadata` in @schemavaults/auth-common — the
// very function the server serves at /.well-known/openid-configuration —
// so no discovery round trip is needed and the SDK cannot drift from
// what the server advertises.

import * as oidc from "openid-client";
import {
  isValidSchemaVaultsAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { buildOidcProviderMetadata } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { isInsecureTransportAllowed } from "./is-insecure-transport-allowed";
import { normalizeOidcIssuer } from "./normalize-oidc-issuer";

export interface CreateOidcClientConfigurationOptions {
  /**
   * The auth server URL — its OIDC issuer identifier, byte-identical to
   * the `iss` claim of the id_tokens it mints.
   */
  auth_server_url: string;
  /** The OAuth2 client_id: this client application's app id. */
  client_app_id: string;
  /**
   * The app environment this client runs in. Decides whether a plain-HTTP
   * auth server is tolerated: only `development` and `test` may talk to
   * the token endpoint without TLS.
   */
  environment: SchemaVaultsAppEnvironment;
  /** Platform adapter supplying the fetch implementation. */
  adapter: ISchemaVaultsAuthClientAdapter;
  /** Timeout for token-endpoint requests, in seconds (default 30). */
  timeout_seconds?: number;
}

/**
 * Creates the openid-client Configuration for this SDK instance.
 *
 * - Server metadata: the auth server's discovery document for
 *   `auth_server_url`, from the shared builder (see module comment).
 * - Public client: PKCE S256 is the binding, token endpoint auth method
 *   `none` (the platform never puts client secrets in browsers).
 * - HTTP requests go through the adapter's fetch so each platform
 *   (browser, Node, React Native) supplies its own implementation.
 *   Token-endpoint requests are sent with `credentials: "include"` so
 *   the auth server's HTTP-only refresh-token cookie travels with the
 *   refresh grant and the `Set-Cookie` on the response is honored.
 * - Plain-HTTP issuers (local dev / the docker-compose test network)
 *   are allowed ONLY in the `development` and `test` environments;
 *   openid-client refuses non-TLS endpoints otherwise, and this function
 *   throws before building such a configuration in any other environment
 *   so a misconfigured `auth_server_url` can never leak tokens over
 *   cleartext in staging or production.
 */
export function createOidcClientConfiguration({
  auth_server_url,
  client_app_id,
  environment,
  adapter,
  timeout_seconds,
}: CreateOidcClientConfigurationOptions): oidc.Configuration {
  if (!isValidSchemaVaultsAppEnvironment(environment)) {
    throw new TypeError(
      `Invalid app environment '${String(environment)}' for the OIDC client configuration!`,
    );
  }
  const issuer: string = normalizeOidcIssuer(auth_server_url);
  const insecure_issuer: boolean = issuer.startsWith("http://");
  if (insecure_issuer && !isInsecureTransportAllowed(environment)) {
    throw new Error(
      `Refusing to use the plain-HTTP auth server '${issuer}' in the '${environment}' environment: ` +
        "the auth server URL must use HTTPS outside of development and test.",
    );
  }
  const server: oidc.ServerMetadata = buildOidcProviderMetadata(issuer);
  const token_endpoint: string = server.token_endpoint as string;

  const config = new oidc.Configuration(
    server,
    client_app_id,
    { token_endpoint_auth_method: "none" },
    oidc.None(),
  );

  if (insecure_issuer) {
    // Reachable only in development/test (asserted above).
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
