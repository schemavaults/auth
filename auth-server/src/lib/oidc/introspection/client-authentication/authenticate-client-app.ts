import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  authenticateTokenEndpointClient,
  type BasicClientCredentials,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import {
  invalidIntrospectionClient,
  type AuthenticateIntrospectionCallerResult,
} from "./types";

export interface AuthenticateClientAppOptions {
  db: Kysely<AuthDatabase>;
  client_app_id: AppId;
  basic_credentials: BasicClientCredentials | null;
  post_client_secret: string | null;
}

/**
 * `client_secret_basic` / `client_secret_post` for client apps, with the
 * token endpoint's machinery. Only confidential clients (apps with a
 * registered client secret) may introspect: a public (PKCE-only) client
 * has no credentials, and accepting anonymous callers would open the
 * endpoint to token scanning.
 */
export async function authenticateClientApp({
  db,
  client_app_id,
  basic_credentials,
  post_client_secret,
}: AuthenticateClientAppOptions): Promise<AuthenticateIntrospectionCallerResult> {
  const clientAuth = await authenticateTokenEndpointClient({
    db,
    client_app_id,
    basic_credentials,
    post_client_secret,
  });
  if (!clientAuth.ok) {
    return {
      ok: false,
      error: {
        error: clientAuth.error,
        error_description: clientAuth.error_description,
      },
    };
  }
  if (!clientAuth.confidential) {
    return invalidIntrospectionClient(
      "Token introspection requires a confidential client; register a client secret for this app.",
    );
  }
  return { ok: true, caller: { kind: "client_app", client_app_id } };
}

export default authenticateClientApp;
