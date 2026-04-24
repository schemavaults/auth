import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function deleteErrorsBefore(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  before_ms: number,
): Promise<number> {
  const result = await db
    .deleteFrom("errors")
    .where("created_at", "<", before_ms)
    .executeTakeFirst();

  return Number(result.numDeletedRows ?? 0);
}

export default deleteErrorsBefore;
