import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";

export async function getFactorById(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<UserMfaFactorRow | null> {
  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", args.uid)
    .where("factor_id", "=", args.factor_id)
    .executeTakeFirst();
  return row ?? null;
}
