import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export interface IssuedTokenCounts {
  access: number;
  refresh: number;
}

function toNumber(raw: string | number | bigint): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse token count as an integer: "${raw}"`);
  }
  return parsed;
}

export async function countTokensIssuedSinceGroupedByUid(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
): Promise<Map<string, IssuedTokenCounts>> {
  const result = new Map<string, IssuedTokenCounts>();

  const rows = await db
    .selectFrom("issued_tokens")
    .where("issued_at", ">", since_ms)
    .select(["uid", "token_type"])
    .select((eb) => eb.fn.countAll().as("count"))
    .groupBy(["uid", "token_type"])
    .execute();

  for (const row of rows) {
    const existing = result.get(row.uid) ?? { access: 0, refresh: 0 };
    const count = toNumber(row.count);
    if (row.token_type === "access") {
      existing.access = count;
    } else if (row.token_type === "refresh") {
      existing.refresh = count;
    }
    result.set(row.uid, existing);
  }

  return result;
}

export default countTokensIssuedSinceGroupedByUid;
