import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApiServerDefinition,
  type ApiServerId,
  isHardcodedApiServerId,
  isValidApiServerId,
} from "@schemavaults/app-definitions";
import { getApiServer } from "./get-api-server";

/**
 * @description Sets whether the API server accepts delegated access tokens,
 * whose RFC 8693 `act` claim names someone acting on behalf of the user
 * (migration 00052). Its managers may call the route that uses this;
 * hardcoded API servers have no row and cannot be updated.
 */
export async function setApiServerDelegatedTokenPolicy(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  accept_delegated_tokens: boolean,
  debug: boolean = false,
): Promise<SchemaVaultsApiServerDefinition | null> {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Received invalid API server ID!");
  }
  if (isHardcodedApiServerId(api_server_id)) {
    throw new Error("Cannot update the delegated-token policy of a hardcoded API server");
  }
  if (typeof accept_delegated_tokens !== "boolean") {
    throw new TypeError("'accept_delegated_tokens' must be a boolean");
  }
  await db
    .updateTable("api_servers")
    .set({ accept_delegated_tokens })
    .where("api_server_id", "=", api_server_id)
    .execute();
  return await getApiServer(db, api_server_id, debug);
}

export default setApiServerDelegatedTokenPolicy;
