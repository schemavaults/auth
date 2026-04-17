import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export async function isTokenRevoked(
  db: Kysely<AuthDatabase>,
  jti: string,
): Promise<boolean> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }

  const row = await db
    .selectFrom("token_revocations")
    .where("jti", "=", jti)
    .select("jti")
    .executeTakeFirst();
  return row !== undefined;
}
