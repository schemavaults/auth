import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export interface CreatedTokenCounts {
  total: number;
  access: number;
  refresh: number;
}

export async function countTokensCreatedByUser(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<CreatedTokenCounts> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const row = await db
    .selectFrom("issued_tokens")
    .where("uid", "=", uid)
    .select((eb) => [
      eb.fn.countAll<string | number>().as("total"),
      eb.fn
        .count<string | number>("jti")
        .filterWhere("token_type", "=", "access")
        .as("access"),
      eb.fn
        .count<string | number>("jti")
        .filterWhere("token_type", "=", "refresh")
        .as("refresh"),
    ])
    .executeTakeFirstOrThrow();

  return {
    total: Number(row.total),
    access: Number(row.access),
    refresh: Number(row.refresh),
  };
}
