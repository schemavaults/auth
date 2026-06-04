import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { IssuedTokenCounts } from "./count-tokens-issued-since-grouped-by-uid";

/**
 * Columns on `issued_tokens` that can be used to bucket token-issuance counts.
 * `client_app_id` powers the "most popular applications" report section, while
 * `audience` powers the "most popular APIs" section.
 */
export type GroupableTokenColumn = "client_app_id" | "audience";

function toNumber(raw: string | number | bigint): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse token count as an integer: "${raw}"`);
  }
  return parsed;
}

/**
 * Count access/refresh tokens issued since `since_ms`, grouped by an arbitrary
 * `issued_tokens` column (e.g. `client_app_id` or `audience`).
 *
 * @see countTokensIssuedSinceGroupedByUid The per-user variant used for the
 *   "top most-active users" section.
 */
export async function countTokensIssuedSinceGroupedByColumn(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
  column: GroupableTokenColumn,
): Promise<Map<string, IssuedTokenCounts>> {
  const result = new Map<string, IssuedTokenCounts>();

  const rows = await db
    .selectFrom("issued_tokens")
    .where("issued_at", ">", since_ms)
    .select([column, "token_type"])
    .select((eb) => eb.fn.countAll().as("count"))
    .groupBy([column, "token_type"])
    .execute();

  for (const row of rows) {
    const key = row[column] as string;
    const existing = result.get(key) ?? { access: 0, refresh: 0 };
    const count = toNumber(row.count);
    if (row.token_type === "access") {
      existing.access = count;
    } else if (row.token_type === "refresh") {
      existing.refresh = count;
    }
    result.set(key, existing);
  }

  return result;
}

export default countTokensIssuedSinceGroupedByColumn;
