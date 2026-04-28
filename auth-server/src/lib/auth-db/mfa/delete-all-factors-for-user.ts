import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Atomically removes every MFA factor and recovery code for a user.
// Used by the user's own "remove factor" flow and by the admin reset
// endpoint.
export async function deleteAllFactorsForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx
      .deleteFrom("user_mfa_recovery_codes")
      .where("uid", "=", uid)
      .execute();
    await tx
      .deleteFrom("user_mfa_factors")
      .where("uid", "=", uid)
      .execute();
  });
}
