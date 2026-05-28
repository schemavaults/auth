import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { MfaFactorType } from "@schemavaults/auth-common";
import type { UserMfaFactorRow } from "./user-mfa-factors-table";

// Returns the user's factor of a given type — verified OR an in-progress
// (unverified) enrollment — filtering factor_type in SQL rather than
// scanning every factor in memory. A verified factor wins over a pending
// enrollment; among unverified rows the most recently created one wins.
export async function getFactorByType(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_type: MfaFactorType },
): Promise<UserMfaFactorRow | null> {
  const row = await db
    .selectFrom("user_mfa_factors")
    .selectAll()
    .where("uid", "=", args.uid)
    .where("factor_type", "=", args.factor_type)
    .orderBy("verified", "desc")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return row ?? null;
}
