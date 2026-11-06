import "server-only";
import {
  getSchemaVaultsAuthServerUrl,
  getSchemavaultsApiServerId,
  type ConfidentialClientCredentials,
} from "@schemavaults/auth-server-sdk";

/**
 * The agents app signs users in as the example's CONFIDENTIAL client (the
 * app the openid-client confidential demo uses): only a client that can
 * authenticate with a secret may exchange its users' tokens for delegated
 * tokens. Its backend keeps the secret; the agents' sandboxes never see it.
 */
export function agentsClientCredentials(): ConfidentialClientCredentials {
  const client_id = process.env.OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID;
  const client_secret = process.env.OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error(
      "The agents example needs OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_ID and OPENID_CLIENT_DEMO_CONFIDENTIAL_CLIENT_SECRET",
    );
  }
  return { auth_server_url: getSchemaVaultsAuthServerUrl(), client_id, client_secret };
}

/**
 * The API server the agents act on: this example's own API (the RFC 8707
 * `resource` the app signs users in for, and the audience of every token an
 * agent holds).
 */
export function agentsApiServerId(): string {
  return getSchemavaultsApiServerId();
}

export const AGENTS_SESSION_COOKIE = "example_agents_session" as const;
export const AGENTS_COOKIE_PATH = "/agents" as const;
