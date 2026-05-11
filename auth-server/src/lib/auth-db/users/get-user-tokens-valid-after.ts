import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * Returns the per-user `tokens_valid_after` watermark in unix seconds.
 * A return value of `0` (the column default) means no watermark has ever
 * been set, in which case no tokens are revoked by this mechanism.
 */
export async function getUserTokensValidAfter(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<number> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const row = await db
    .selectFrom("users")
    .where("uid", "=", uid)
    .select("tokens_valid_after")
    .executeTakeFirst();

  if (!row) return 0;
  const value: unknown = row.tokens_valid_after;
  if (value === null || value === undefined) return 0;
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

export default getUserTokensValidAfter;
