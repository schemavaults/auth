import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  doesStoredHashNeedUpgrade,
  hashPasswordV3,
  LATEST_PASSWORD_HASH_VERSION,
} from "@/lib/hash_password";
import { getPasswordRecord } from "./get-password-hash";

/**
 * Re-hash a verified plaintext password under the latest hashing scheme and
 * overwrite the row in `passwords`. Called only from login, after the user's
 * plaintext has already been successfully verified against the stored hash.
 * Covers both legacy-version rows (v1/v2 iterated SHA-256) and current-version
 * (v3 argon2id) rows whose embedded cost parameters no longer match the
 * configured PRIVATE_ARGON2_* values.
 *
 * The UPDATE is conditioned on the stored hash still being the one we just
 * inspected (`password = <old hash>`), so a concurrent upgrade from another
 * session is a no-op rather than an error or duplicate rewrite.
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
  const record = await getPasswordRecord(db, uid, debug);
  if (
    !doesStoredHashNeedUpgrade(record.password_hash_version, record.password)
  ) {
    if (debug) {
      console.log(
        `[upgradePasswordHash] Stored hash already current for uid: ${uid}; nothing to do`,
      );
    }
    return;
  }

  if (debug) {
    console.log(
      `[upgradePasswordHash] Re-hashing password under v${LATEST_PASSWORD_HASH_VERSION} for uid: ${uid}`,
    );
  }

  const newHash: string = await hashPasswordV3(plaintextPassword);

  await db
    .updateTable("passwords")
    .set({
      password: newHash,
      password_hash_version: LATEST_PASSWORD_HASH_VERSION,
    })
    .where("uid", "=", uid)
    .where("password", "=", record.password)
    .execute();

  if (debug) {
    console.log(`[upgradePasswordHash] Password hash upgraded for uid: ${uid}`);
  }
}

export default upgradePasswordHash;
