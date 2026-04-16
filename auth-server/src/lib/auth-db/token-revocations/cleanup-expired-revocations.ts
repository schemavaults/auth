import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function cleanupExpiredRevocations(
  db: Kysely<AuthDatabase>,
): Promise<number> {
  const now = Date.now();
  const result = await db
    .deleteFrom("token_revocations")
    .where("expires_at", "<=", now)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0);
}
