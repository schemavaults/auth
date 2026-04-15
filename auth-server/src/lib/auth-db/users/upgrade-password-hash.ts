import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashPasswordV2, LATEST_PASSWORD_HASH_VERSION } from "@/lib/hash_password";

/**
 * Re-hash a verified plaintext password under the latest hashing scheme and
 * overwrite the row in `passwords`. Called only from login, after the user's
 * plaintext has already been successfully verified against the legacy hash.
 *
 * Uses a conditional UPDATE (`password_hash_version < LATEST_PASSWORD_HASH_VERSION`)
 * so a concurrent upgrade from another session is a no-op rather than an error.
 * `password_id` and `created_at` are preserved so the audit trail continues to
 * reflect when the credential was originally set -- we are re-encoding, not
 * replacing, the secret.
 */
export async function upgradePasswordHash(
  db: Kysely<AuthDatabase>,
  uid: string,
  plaintextPassword: string,
  debug: boolean = false,
): Promise<void> {
  if (debug) {
    console.log(
      `[upgradePasswordHash] Re-hashing password under v${LATEST_PASSWORD_HASH_VERSION} for uid: ${uid}`,
    );
  }

  const newHash: string = await hashPasswordV2(uid, plaintextPassword);

  await db
    .updateTable("passwords")
    .set({
      password: newHash,
      password_hash_version: LATEST_PASSWORD_HASH_VERSION,
    })
    .where("uid", "=", uid)
    .where("password_hash_version", "<", LATEST_PASSWORD_HASH_VERSION)
    .execute();

  if (debug) {
    console.log(`[upgradePasswordHash] Password hash upgraded for uid: ${uid}`);
  }
}

export default upgradePasswordHash;
