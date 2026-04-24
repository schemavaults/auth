import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ErrorRow } from "./errors-table";

export async function listErrorsCreatedSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
): Promise<readonly ErrorRow[]> {
  const rows = await db
    .selectFrom("errors")
    .selectAll()
    .where("created_at", ">", since_ms)
    .orderBy("created_at", "desc")
    .execute();

  // Postgres BIGINT is returned as a string by the pg driver; coerce to a
  // real number so downstream `new Date(ms)` / comparisons behave correctly.
  return rows.map((r) => ({ ...r, created_at: Number(r.created_at) }));
}

export default listErrorsCreatedSince;
