import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function hasVerifiedFactor(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("user_mfa_factors")
    .select("factor_id")
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}
