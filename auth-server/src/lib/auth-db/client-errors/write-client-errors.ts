import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewClientErrorRow } from "./client-errors-table";

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

export async function insertClientError(db: Db, row: NewClientErrorRow): Promise<void> {
  await db.insertInto("client_errors").values(row).execute();
}

export async function deleteClientErrorById(db: Db, client_error_id: string): Promise<boolean> {
  const result = await db
    .deleteFrom("client_errors")
    .where("client_error_id", "=", client_error_id)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0) > 0;
}

/** Deletes the errors received before `before_ms`; returns how many were deleted. */
export async function deleteClientErrorsBefore(db: Db, before_ms: number): Promise<number> {
  const result = await db
    .deleteFrom("client_errors")
    .where("created_at", "<", before_ms)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}

/** Total `size_bytes` of the stored reports (what the storage limit is checked against). */
export async function sumClientErrorSizeBytes(db: Db): Promise<number> {
  const row = await db
    .selectFrom("client_errors")
    .select((eb) => eb.fn.coalesce(eb.fn.sum<string | number>("size_bytes"), eb.lit(0)).as("total"))
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}
