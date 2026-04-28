import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Flips an unverified factor row to verified=true and records the
// verification timestamp. Returns true if a row was updated, false if
// no matching unverified row exists for the user.
export async function verifyFactor(
  db: Kysely<AuthDatabase>,
  args: { uid: string; factor_id: string },
): Promise<boolean> {
  const result = await db
    .updateTable("user_mfa_factors")
    .set({ verified: true, verified_at: Date.now() })
    .where("uid", "=", args.uid)
    .where("factor_id", "=", args.factor_id)
    .where("verified", "=", false)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
