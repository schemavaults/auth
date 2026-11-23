import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import parseAppDefinitionDatabaseRow from "./parse-app-definition-database-row";

/**
 * @description Lists the apps owned directly by a user account
 * (`owner_type = 'user'`), independent of any organization membership.
 */
export async function listUserOwnedApps(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
): Promise<SchemaVaultsApp[]> {
  if (typeof uid !== "string" || uid.length === 0) {
    throw new TypeError("Invalid user ID to list owned apps for!");
  }

  const MAX_PAGE_SIZE: number = 50;

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("apps")
      .where("owner_type", "=", "user")
      .where("owner_uid", "=", uid)
      .orderBy("created_at", "desc")
      .limit(MAX_PAGE_SIZE)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(`Failed to list apps owned by user '${uid}':`, e);
    throw new Error("Failed to list apps owned by user");
  }

  return rows.map((row) => parseAppDefinitionDatabaseRow(row));
}

export default listUserOwnedApps;
