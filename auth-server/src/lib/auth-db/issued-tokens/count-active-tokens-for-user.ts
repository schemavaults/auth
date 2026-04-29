import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export interface ActiveTokenCounts {
  active_access: number;
  active_refresh: number;
}

export async function countActiveTokensForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
  now: number = Date.now(),
): Promise<ActiveTokenCounts> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const row = await db
    .selectFrom("issued_tokens")
    .leftJoin("token_revocations", "token_revocations.jti", "issued_tokens.jti")
    .where("issued_tokens.uid", "=", uid)
    .where("issued_tokens.expires_at", ">", now)
    .where("token_revocations.jti", "is", null)
    .select((eb) => [
      eb.fn
        .count<string | number>("issued_tokens.jti")
        .filterWhere("issued_tokens.token_type", "=", "access")
        .as("active_access"),
      eb.fn
        .count<string | number>("issued_tokens.jti")
        .filterWhere("issued_tokens.token_type", "=", "refresh")
        .as("active_refresh"),
    ])
    .executeTakeFirstOrThrow();

  return {
    active_access: Number(row.active_access),
    active_refresh: Number(row.active_refresh),
  };
}
