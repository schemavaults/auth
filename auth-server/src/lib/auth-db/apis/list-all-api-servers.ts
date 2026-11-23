import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApiServerDefinition,
  getHardcodedSchemaVaultsApis,
} from "@schemavaults/app-definitions";
import { parseApiServerDefinitionsFromDbRows } from "./parse-api-server-definition-database-rows";

async function listAllApiServersFromDatabase(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
): Promise<readonly SchemaVaultsApiServerDefinition[]> {
  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("api_servers")
      .limit(100)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to list all API servers from database");
  }

  try {
    return await parseApiServerDefinitionsFromDbRows(rows);
  } catch (e: unknown) {
    console.error(e);
    throw new Error(
      "Failed to parse the API servers data received from database",
    );
  }
}

function listAllHardcodedApiServers(): readonly SchemaVaultsApiServerDefinition[] {
  return getHardcodedSchemaVaultsApis();
}

/**
 * @description Every API server: the hardcoded ones followed by the
 * database rows.
 * @throws Error when a database row reuses a hardcoded API server id
 */
export async function listAllApiServers(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
): Promise<readonly SchemaVaultsApiServerDefinition[]> {
  const all_api_servers: SchemaVaultsApiServerDefinition[] = []

  const hardcoded_api_servers: readonly SchemaVaultsApiServerDefinition[] = listAllHardcodedApiServers()
  const hardcodedApiServerIds: Set<string> = new Set(hardcoded_api_servers.map(srv => srv.api_server_id));

  const api_servers_from_db: readonly SchemaVaultsApiServerDefinition[] = await listAllApiServersFromDatabase(db)
  if (api_servers_from_db.some(db_api_server => hardcodedApiServerIds.has(db_api_server.api_server_id))) {
    throw new Error("API server ID from database conflicts with hardcoded API server definition!")
  }

  // Combine hardcoded + DB API servers
  all_api_servers.push(...hardcoded_api_servers);
  all_api_servers.push(...api_servers_from_db);
  return all_api_servers;
}

export default listAllApiServers;
