import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getApp } from "@/lib/auth-db/apps";
import {
  authenticateTokenEndpointClient,
  type BasicClientCredentials,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import type { RevocationRequestError } from "./types";

export interface AuthenticateRevocationClientOptions {
  db: Kysely<AuthDatabase>;
  client_app_id: AppId;
  basic_credentials: BasicClientCredentials | null;
  post_client_secret: string | null;
}

export type AuthenticateRevocationClientResult =
  | { ok: true }
  | { ok: false; error: RevocationRequestError };

/**
 * RFC 7009 §2.1: "The authorization server first validates the client
 * credentials (in case of a confidential client)". Clients authenticate
 * exactly as at the token endpoint (authenticateTokenEndpointClient): an
 * app with a registered client secret must present it, and an app without
 * one (a public client) is identified by its `client_id` alone, so it can
 * revoke the tokens issued to it. Unlike the token endpoint, which leaves
 * an unknown `client_id` to each grant, an unknown client is refused here.
 */
export async function authenticateRevocationClient({
  db,
  client_app_id,
  basic_credentials,
  post_client_secret,
}: AuthenticateRevocationClientOptions): Promise<AuthenticateRevocationClientResult> {
  if ((await getApp(db, client_app_id)) === null) {
    return {
      ok: false,
      error: { error: "invalid_client", error_description: "Unknown client." },
    };
  }

  const authentication = await authenticateTokenEndpointClient({
    db,
    client_app_id,
    basic_credentials,
    post_client_secret,
  });
  if (!authentication.ok) {
    return {
      ok: false,
      error: {
        error: authentication.error,
        error_description: authentication.error_description,
      },
    };
  }
  return { ok: true };
}

export default authenticateRevocationClient;
