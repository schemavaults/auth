import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

// Generates a fresh factor_id and inserts an unverified WebAuthn (passkey)
// factor for the user. Unlike TOTP factors, a passkey has no symmetric
// secret — its credential material (public key + counter) is persisted
// separately in user_webauthn_credentials once the registration ceremony is
// verified (see persistWebauthnCredential). Caller is responsible for
// sweeping prior unverified rows (see sweepStaleUnverifiedFactors).
export async function createUnverifiedWebauthnFactor(
  db: Kysely<AuthDatabase>,
  args: { uid: string },
): Promise<{ factor_id: string }> {
  const factor_id = crypto.randomUUID();
  await db
    .insertInto("user_mfa_factors")
    .values({
      factor_id,
      uid: args.uid,
      factor_type: "webauthn",
      secret_ciphertext: null,
      kek_version: null,
      verified: false,
      created_at: Date.now(),
      verified_at: null,
      last_used_at: null,
    })
    .execute();
  return { factor_id };
}
