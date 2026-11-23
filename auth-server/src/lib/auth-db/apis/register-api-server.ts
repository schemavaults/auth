import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { organizationIdSchema } from "@schemavaults/auth-common";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
  type ResourceOwnership,
  isHardcodedApiServerId,
  isValidApiServerId,
} from "@schemavaults/app-definitions";
import { toOwnershipDatabaseColumns } from "@/lib/ownership/ownership-columns";
import { ConflictError } from "@/lib/error/ConflictError";
import type { NewApiServer } from "./apis-table";

export interface RegisterApiServerOptions {
  api_server_id: string;
  api_server_name: string;
  api_server_description: string;
  publicly_listed: boolean;
  /** Who the API server belongs to; see `resolveRequestedOwnershipForCreation`. */
  ownership: ResourceOwnership;
  /** The creating user's uid, for the audit trail (null when unknown). */
  created_by?: string | null;
}

/**
 * @description Inserts a new API server row.
 * @throws ConflictError when the id is reserved by the platform or taken
 */
export async function registerApiServer(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  {
    api_server_id,
    api_server_name,
    api_server_description,
    publicly_listed,
    ownership,
    created_by = null,
  }: RegisterApiServerOptions,
): Promise<void> {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError(
      "Received invalid API server ID!",
    );
  }

  if (ownership.owner_type === "organization") {
    const parsed_organization_id = organizationIdSchema.safeParse(ownership.owner_organization_id);
    if (!parsed_organization_id.success) {
      throw new TypeError("Received invalid organization ID to register API server to!", {
        cause: parsed_organization_id.error,
      });
    }
  }

  // Hardcoded API server ids (the auth server's own id, the reserved
  // OIDC userinfo audience) have no database row, so the insert's
  // uniqueness conflict cannot protect them — and a colliding row
  // would make listAllApiServers() throw. Reject them here.
  if (isHardcodedApiServerId(api_server_id)) {
    throw new ConflictError(
      `API server ID '${api_server_id}' is reserved by the platform`,
    );
  }

  const parsed_api_server =
    await schemaVaultsApiServerDefinitionSchema.safeParseAsync({
      api_server_id,
      api_server_name,
      api_server_description,
      created_at: Date.now(),
      public: publicly_listed ?? false,
      hardcoded: false,
      ...ownership,
      created_by,
    } satisfies SchemaVaultsApiServerDefinition);
  if (!parsed_api_server.success) {
    console.error(parsed_api_server.error.issues);
    throw new TypeError("Failed to parse API server definition", {
      cause: parsed_api_server.error,
    });
  }
  const api_server: SchemaVaultsApiServerDefinition = parsed_api_server.data;

  const row: NewApiServer = {
    api_server_id: api_server.api_server_id,
    api_server_name: api_server.api_server_name,
    api_server_description: api_server.api_server_description,
    created_at: api_server.created_at,
    public: api_server.public,
    hardcoded: false,
    ...toOwnershipDatabaseColumns(ownership),
    created_by,
  };

  const result = await db
    .insertInto("api_servers")
    .values(row)
    .onConflict((oc) => oc.column("api_server_id").doNothing())
    .executeTakeFirst();

  if (result.numInsertedOrUpdatedRows === BigInt(0)) {
    throw new ConflictError("An API server with this ID already exists");
  }
}

export default registerApiServer;
