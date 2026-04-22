import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ErrorRow } from "./errors-table";

export async function listErrorsCreatedSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
): Promise<readonly ErrorRow[]> {
  return await db
    .selectFrom("errors")
    .selectAll()
    .where("created_at", ">", since_ms)
    .orderBy("created_at", "desc")
    .execute();
}

export default listErrorsCreatedSince;
