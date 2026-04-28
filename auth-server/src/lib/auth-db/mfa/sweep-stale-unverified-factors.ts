import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

const STALE_UNVERIFIED_FACTOR_TTL_MS = 15 * 60 * 1000;

// Removes any unverified factors older than the TTL for the given user.
// Called at the start of an enrollment attempt so a user can always
// restart enrollment without colliding with an abandoned previous one.
export async function sweepStaleUnverifiedFactors(
  db: Kysely<AuthDatabase>,
  uid: string,
): Promise<void> {
  const cutoff = Date.now() - STALE_UNVERIFIED_FACTOR_TTL_MS;
  await db
    .deleteFrom("user_mfa_factors")
    .where("uid", "=", uid)
    .where("verified", "=", false)
    .where("created_at", "<", cutoff)
    .execute();
}
