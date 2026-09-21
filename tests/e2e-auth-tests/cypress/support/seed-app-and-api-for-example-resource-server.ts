import { PEMFormat } from "@schemavaults/jwt";

export interface SeedAppAndApiOptions {
  /**
   * Plaintext client secret to register for the seeded app, making it an
   * OAuth2/OIDC *confidential* client: every token-endpoint request for
   * it must then authenticate with client_secret_basic or
   * client_secret_post. Omit to seed a public (PKCE-only) client.
   */
  client_secret?: string;
  /**
   * Explicit redirect_uri allowlist for the seeded app. While empty, any
   * path on the app's registered domain is accepted; once non-empty,
   * redirect_uri must match one of these exactly.
   */
  callback_urls?: readonly string[];
  /**
   * Additional (already seeded) API server ids to connect the app to, so
   * it may request RFC 8707 `resource` tokens for them — e.g. a
   * confidential client minting client_credentials tokens for the example
   * resource server's API.
   */
  connect_to_api_server_ids?: readonly string[];
  /**
   * Whether clients registered through RFC 7591 dynamic client
   * registration may request `resource` tokens for the seeded API server
   * without an explicit connection.
   */
  allow_dynamic_clients?: boolean;
  /**
   * How an RFC 8707 `resource` URL is matched against the seeded API
   * server's domain: `exact` (default) or `prefix`.
   */
  resource_url_match_mode?: "exact" | "prefix";
}

export async function seedAppAndApiForExampleResourceServer(
  auth_server_url: string,
  new_api_id: string,
  new_app_url: string,
  jwks_access_public_key: string,
  options: SeedAppAndApiOptions = {},
): Promise<void> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  if (!PEMFormat.isPemFormat(jwks_access_public_key, "PUBLIC")) {
    throw new TypeError(
      "Expected 'jwks_access_public_key' to be a valid public key in PEM format",
    );
  }

  const endpoint: string = `${auth_server_url}/api/test/seed/create-test-nextjs-app/${new_api_id}`;

  console.log(
    `[preRegisterSuperuser] Seeding database with example app/api for test suite: POST => ${endpoint}`,
  );

  // The seed route's body schema is `.strict()`, so only send the
  // optional fields when they are actually configured.
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: new_app_url,
      jwks_access_public_key,
      ...(options.client_secret ? { client_secret: options.client_secret } : {}),
      ...(options.callback_urls && options.callback_urls.length > 0
        ? { callback_urls: [...options.callback_urls] }
        : {}),
      ...(options.connect_to_api_server_ids &&
      options.connect_to_api_server_ids.length > 0
        ? { connect_to_api_server_ids: [...options.connect_to_api_server_ids] }
        : {}),
      ...(typeof options.allow_dynamic_clients === "boolean"
        ? { allow_dynamic_clients: options.allow_dynamic_clients }
        : {}),
      ...(options.resource_url_match_mode
        ? { resource_url_match_mode: options.resource_url_match_mode }
        : {}),
    }),
  });
  if (!response.ok || response.status !== 200) {
    throw new Error(
      `Failed to seed auth-server with details about example resource server! ${response.status} ${response.statusText}`,
    );
  }
  return;
}

export default seedAppAndApiForExampleResourceServer;
