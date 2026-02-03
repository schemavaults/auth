import type { ApiServerId, SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import SchemaVaultsApiServerRegistry from "./api-server-registry";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export interface ILoadApiServerDefinitionFromDatabaseOpts {
  api_server_id: ApiServerId;
  db: Kysely<AuthDatabase>;
}

export default async function loadApiServerDefinitionFromDatabase(
  { api_server_id, db }: ILoadApiServerDefinitionFromDatabaseOpts
): Promise<SchemaVaultsApiServerDefinition> {
  const api_server_definition = await new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id);
  if (!api_server_definition) {
    throw new Error("Failed to resolve API server from API server registry!")
  }
  return api_server_definition
}
