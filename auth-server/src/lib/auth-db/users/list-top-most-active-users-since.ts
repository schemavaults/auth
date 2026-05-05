import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { countTokensIssuedSinceGroupedByUid } from "@/lib/auth-db/issued-tokens";

export interface TopMostActiveUserRow {
  uid: string;
  email: string;
  sign_in_count: number;
  access_token_count: number;
  refresh_token_count: number;
}

interface UidActivity {
  sign_in: number;
  access: number;
  refresh: number;
}

function toNumber(raw: string | number | bigint): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Failed to parse activity count as an integer: "${raw}"`);
  }
  return parsed;
}

export async function listTopMostActiveUsersSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
  limit: number = 10,
): Promise<readonly TopMostActiveUserRow[]> {
  const [signInRows, tokenCountsByUid] = await Promise.all([
    db
      .selectFrom("authorization_codes")
      .where("created_at", ">", since_ms)
      .select(["uid"])
      .select((eb) => eb.fn.countAll().as("sign_in_count"))
      .groupBy("uid")
      .execute(),
    countTokensIssuedSinceGroupedByUid(db, since_ms),
  ]);

  const activityByUid = new Map<string, UidActivity>();
  for (const row of signInRows) {
    activityByUid.set(row.uid, {
      sign_in: toNumber(row.sign_in_count),
      access: 0,
      refresh: 0,
    });
  }
  for (const [uid, counts] of tokenCountsByUid.entries()) {
    const existing = activityByUid.get(uid) ?? { sign_in: 0, access: 0, refresh: 0 };
    existing.access = counts.access;
    existing.refresh = counts.refresh;
    activityByUid.set(uid, existing);
  }

  const ranked = Array.from(activityByUid.entries())
    .map(([uid, a]) => ({
      uid,
      sign_in: a.sign_in,
      access: a.access,
      refresh: a.refresh,
      total: a.sign_in + a.access + a.refresh,
    }))
    .sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;
      if (y.sign_in !== x.sign_in) return y.sign_in - x.sign_in;
      return x.uid < y.uid ? -1 : x.uid > y.uid ? 1 : 0;
    })
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const topUids = ranked.map((r) => r.uid);
  const userRows = await db
    .selectFrom("users")
    .where("uid", "in", topUids)
    .select(["uid", "email"])
    .execute();
  const emailByUid = new Map<string, string>();
  for (const row of userRows) {
    emailByUid.set(row.uid, row.email);
  }

  return ranked.map((r) => ({
    uid: r.uid,
    email: emailByUid.get(r.uid) ?? "",
    sign_in_count: r.sign_in,
    access_token_count: r.access,
    refresh_token_count: r.refresh,
  }));
}

export default listTopMostActiveUsersSince;
