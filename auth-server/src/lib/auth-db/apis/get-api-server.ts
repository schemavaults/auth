import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  type ApiServerId,
  getHardcodedSchemaVaultsApis,
} from "@schemavaults/app-definitions";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { ownershipFieldsFromDatabaseRow } from "@/lib/ownership/ownership-columns";

/**
 * @description Loads an API server definition: a hardcoded one (the auth
 * server's own APIs) or its `api_servers` row.
 * @returns null when no API server has this id
 */
export async function getApiServer(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  debug: boolean = false,
): Promise<SchemaVaultsApiServerDefinition | null> {
  if (debug) {
    console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}')`)
  }

  const hardcoded_api_server: SchemaVaultsApiServerDefinition | undefined = getHardcodedSchemaVaultsApis().find(hardcoded_api => {
    return hardcoded_api.api_server_id === api_server_id
  })
  if (hardcoded_api_server) {
    if (hardcoded_api_server.owner_organization_id !== getAuthServerOwnerOrganizationId()) {
      throw new Error("Expected hardcoded API servers to be owned by the configured owner organization!")
    }
    if (debug) {
      console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}') -> Found hardcoded API: `, hardcoded_api_server)
    }
    return hardcoded_api_server satisfies SchemaVaultsApiServerDefinition;
  }

  const getApiServerQuery = db
    .selectFrom("api_servers")
    .where("api_server_id", "=", api_server_id)
    .selectAll()
    .limit(1);

  const rows = await getApiServerQuery.execute();
  if (rows.length === 0) {
    return null;
  } else if (rows.length > 1) {
    throw new Error("Multiple API servers found with the same api_server_id");
  }

  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') {
    throw new Error("Expected there to be exactly one API server row retrieved from the database if this point was reached!");
  }

  const first_row = rows[0];
  if (!Object.hasOwn(first_row, "created_at")) {
    throw new Error("Missing creation time in row data");
  }

  const createdAt: number =
    typeof first_row.created_at === "string"
      ? parseInt(first_row.created_at)
      : first_row.created_at;
  if (isNaN(createdAt)) {
    throw new Error("Failed to parse created_at from database");
  }

  const parsed_api_server =
    await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
      ...first_row,
      created_at: createdAt,
      hardcoded: false,
      ...ownershipFieldsFromDatabaseRow(first_row),
    });
  if (!parsed_api_server.success) {
    console.error(parsed_api_server.error.issues);
    throw new Error("Failed to parse API server from database");
  }
  const output: SchemaVaultsApiServerDefinition = parsed_api_server.data;

  if (debug) {
    console.log(`[SchemaVaultsApiServerRegistry] getApiServer('${api_server_id}') -> Loaded API from DB: `, output)
  }

  return output;
}

export default getApiServer;
