import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Best-effort update; never throws.
export async function touchFactorLastUsed(
  db: Kysely<AuthDatabase>,
  factor_id: string,
): Promise<void> {
  try {
    await db
      .updateTable("user_mfa_factors")
      .set({ last_used_at: Date.now() })
      .where("factor_id", "=", factor_id)
      .execute();
  } catch {
    // intentionally swallowed
  }
}
