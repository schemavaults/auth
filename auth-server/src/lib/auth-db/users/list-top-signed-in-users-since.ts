import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { countTokensIssuedSinceByUids } from "@/lib/auth-db/issued-tokens";

export interface TopSignedInUserRow {
  uid: string;
  email: string;
  sign_in_count: number;
  access_token_count: number;
  refresh_token_count: number;
}

function toNumber(raw: string | number | bigint): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse sign-in count as an integer: "${raw}"`);
  }
  return parsed;
}

export async function listTopSignedInUsersSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
  limit: number = 10,
): Promise<readonly TopSignedInUserRow[]> {
  const rows = await db
    .selectFrom("authorization_codes")
    .innerJoin("users", "users.uid", "authorization_codes.uid")
    .where("authorization_codes.created_at", ">", since_ms)
    .select([
      "authorization_codes.uid as uid",
      "users.email as email",
    ])
    .select((eb) => eb.fn.countAll().as("sign_in_count"))
    .groupBy(["authorization_codes.uid", "users.email"])
    .orderBy("sign_in_count", "desc")
    .limit(limit)
    .execute();

  const topUids = rows.map((row) => row.uid);
  const tokenCountsByUid = await countTokensIssuedSinceByUids(
    db,
    since_ms,
    topUids,
  );

  return rows.map((row) => {
    const tokenCounts = tokenCountsByUid.get(row.uid) ?? {
      access: 0,
      refresh: 0,
    };
    return {
      uid: row.uid,
      email: row.email,
      sign_in_count: toNumber(row.sign_in_count),
      access_token_count: tokenCounts.access,
      refresh_token_count: tokenCounts.refresh,
    };
  });
}

export default listTopSignedInUsersSince;
