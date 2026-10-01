import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { authenticateApiServer } from "./authenticate-api-server";
import { authenticateClientApp } from "./authenticate-client-app";
import type {
  AuthenticateIntrospectionCallerResult,
  IntrospectionClientCredentials,
} from "./types";

/**
 * Verifies the credentials of a parsed introspection request and returns
 * who is asking: a client app (client secret) or an API server
 * (`private_key_jwt`). Which tokens each may then see is decided by the
 * introspection itself (caller-visibility.ts).
 */
export async function authenticateIntrospectionCaller(
  db: Kysely<AuthDatabase>,
  credentials: IntrospectionClientCredentials,
): Promise<AuthenticateIntrospectionCallerResult> {
  switch (credentials.method) {
    case "private_key_jwt":
      return await authenticateApiServer({
        db,
        client_assertion: credentials.client_assertion,
        client_id: credentials.client_id,
      });
    case "client_secret":
      return await authenticateClientApp({
        db,
        client_app_id: credentials.client_app_id,
        basic_credentials: credentials.basic_credentials,
        post_client_secret: credentials.post_client_secret,
      });
  }
}

export default authenticateIntrospectionCaller;
