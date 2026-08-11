// authenticate-token-endpoint-client.ts
//
// OAuth2 client authentication for the token endpoints (RFC 6749 §2.3,
// §3.2.1). Apps with a registered client secret are confidential
// clients: every token-endpoint request for them MUST authenticate with
// the secret, via either an HTTP Basic Authorization header
// (client_secret_basic, RFC 6749 §2.3.1) or a client_secret request
// parameter (client_secret_post). Apps without a registered secret
// remain public clients (PKCE-only), and any secret they do present is
// rejected rather than ignored so misconfiguration fails loudly.

import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getAppClientSecretRecord } from "@/lib/auth-db/apps/app-registry/app-client-secrets";
import { verifyClientSecret } from "./client-secret";

/**
 * RFC 6749 §5.2: a 401 for failed client authentication must include a
 * WWW-Authenticate header matching the scheme when the client attempted
 * Basic authentication; we advertise Basic support on every 401 so
 * clients know the scheme is available.
 */
export const TOKEN_ENDPOINT_WWW_AUTHENTICATE = 'Basic realm="oauth2/token", charset="UTF-8"';

export interface BasicClientCredentials {
  client_id: string;
  client_secret: string;
}

/**
 * Parse an HTTP Basic Authorization header into client credentials per
 * RFC 6749 §2.3.1 (the username and password are form-urlencoded before
 * base64 encoding). Returns:
 *  - null when the header is absent or uses a different scheme
 *  - "malformed" when the header claims Basic but cannot be decoded
 */
export function parseBasicClientCredentials(
  authorization_header: string | null,
): BasicClientCredentials | "malformed" | null {
  if (typeof authorization_header !== "string") {
    return null;
  }
  const match = authorization_header.match(/^Basic\s+(.+)$/i);
  const encoded_credentials: string | undefined = match?.[1];
  if (!encoded_credentials) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded_credentials, "base64").toString("utf8");
  } catch {
    return "malformed";
  }

  const separator: number = decoded.indexOf(":");
  if (separator < 0) {
    return "malformed";
  }

  try {
    const client_id: string = decodeURIComponent(decoded.slice(0, separator));
    const client_secret: string = decodeURIComponent(
      decoded.slice(separator + 1),
    );
    if (client_id.length === 0) {
      return "malformed";
    }
    return { client_id, client_secret };
  } catch {
    return "malformed";
  }
}

export type ClientAuthenticationResult =
  | {
      ok: true;
      /** Whether the app authenticated with a registered client secret. */
      confidential: boolean;
    }
  | {
      ok: false;
      error: "invalid_request" | "invalid_client";
      error_description: string;
      status: 400 | 401;
    };

export interface AuthenticateTokenEndpointClientOptions {
  db: Kysely<AuthDatabase>;
  client_app_id: AppId;
  /** Parsed Basic Authorization header credentials, if any. */
  basic_credentials: BasicClientCredentials | null;
  /** client_secret presented in the request body/form, if any. */
  post_client_secret: string | null;
}

export async function authenticateTokenEndpointClient({
  db,
  client_app_id,
  basic_credentials,
  post_client_secret,
}: AuthenticateTokenEndpointClientOptions): Promise<ClientAuthenticationResult> {
  // RFC 6749 §2.3: clients MUST NOT use more than one authentication
  // method in each request.
  if (basic_credentials && post_client_secret) {
    return {
      ok: false,
      error: "invalid_request",
      error_description:
        "Multiple client authentication methods used; present the client_secret via either the Authorization header or the request body, not both.",
      status: 400,
    };
  }

  if (basic_credentials && basic_credentials.client_id !== client_app_id) {
    return {
      ok: false,
      error: "invalid_client",
      error_description:
        "The Authorization header credentials do not match the request's client_id.",
      status: 401,
    };
  }

  const presented_client_secret: string | null =
    basic_credentials?.client_secret ?? post_client_secret;

  const secretRecord = await getAppClientSecretRecord(db, client_app_id);

  if (!secretRecord) {
    if (presented_client_secret) {
      return {
        ok: false,
        error: "invalid_client",
        error_description:
          "This client has no client secret registered; do not send client credentials.",
        status: 401,
      };
    }
    return { ok: true, confidential: false };
  }

  if (!presented_client_secret) {
    return {
      ok: false,
      error: "invalid_client",
      error_description:
        "Client authentication is required for this client (client_secret_basic or client_secret_post).",
      status: 401,
    };
  }

  if (
    !verifyClientSecret(presented_client_secret, secretRecord.secret_hash)
  ) {
    return {
      ok: false,
      error: "invalid_client",
      error_description: "Invalid client credentials.",
      status: 401,
    };
  }

  return { ok: true, confidential: true };
}

export default authenticateTokenEndpointClient;
