import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function countRecoveryCodesRemaining(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<number> {
  const row = await db
    .selectFrom("user_mfa_recovery_codes")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("uid", "=", uid)
    .where("used_at", "is", null)
    .executeTakeFirst();
  if (!row) return 0;
  const n = Number(row.count);
  return Number.isFinite(n) ? n : 0;
}
