import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { encryptSecret } from "@/lib/mfa/kek";

// Generates a fresh factor_id and inserts an unverified TOTP factor for
// the user. Caller is responsible for sweeping any prior unverified rows
// (see sweepStaleUnverifiedFactors) and asserting the user does not yet
// have a verified factor.
export async function createUnverifiedFactor(
  db: Kysely<AuthDatabase>,
  args: { uid: string; secret: string },
): Promise<{ factor_id: string }> {
  const { ciphertext, kek_version } = encryptSecret(args.secret);
  const factor_id = crypto.randomUUID();
  await db
    .insertInto("user_mfa_factors")
    .values({
      factor_id,
      uid: args.uid,
      factor_type: "totp",
      secret_ciphertext: ciphertext,
      kek_version,
      verified: false,
      created_at: Date.now(),
      verified_at: null,
      last_used_at: null,
    })
    .execute();
  return { factor_id };
}
