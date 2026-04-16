import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function isTokenRevoked(
  db: Kysely<AuthDatabase>,
  jti: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("token_revocations")
    .where("jti", "=", jti)
    .select("jti")
    .executeTakeFirst();
  return row !== undefined;
}
