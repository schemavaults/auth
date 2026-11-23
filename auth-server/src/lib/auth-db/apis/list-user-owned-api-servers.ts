import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { parseApiServerDefinitionsFromDbRows } from "./parse-api-server-definition-database-rows";

/**
 * @description Lists the API servers owned directly by a user account
 * (`owner_type = 'user'`), independent of any organization membership.
 */
export async function listUserOwnedApiServers(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
): Promise<readonly SchemaVaultsApiServerDefinition[]> {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new TypeError("Invalid user ID to list owned API servers for!");
  }

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("api_servers")
      .where("owner_type", "=", "user")
      .where("owner_uid", "=", uid)
      .orderBy("created_at", "desc")
      .limit(100)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(`Failed to list API servers owned by user '${uid}':`, e);
    throw new Error("Failed to list API servers owned by user", { cause: e });
  }

  return await parseApiServerDefinitionsFromDbRows(rows);
}

export default listUserOwnedApiServers;
