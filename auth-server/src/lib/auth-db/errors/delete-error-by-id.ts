import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function deleteErrorById(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  error_id: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("errors")
    .where("error_id", "=", error_id)
    .executeTakeFirst();

  return Number(result.numDeletedRows ?? 0) > 0;
}

export default deleteErrorById;
