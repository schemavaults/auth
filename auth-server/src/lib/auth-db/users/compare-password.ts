import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  doesStoredHashNeedUpgrade,
  verifyPassword,
} from "@/lib/hash_password";
import { getPasswordRecord } from "./get-password-hash";

export interface ComparePasswordResult {
  /** Whether the supplied plaintext password matches the stored hash. */
  matches: boolean;
  /**
   * Whether the stored hash was produced by an older scheme and should be
   * re-hashed under the current scheme. Only meaningful when `matches` is
   * `true` -- callers should ignore this when the password did not match.
   */
  needsUpgrade: boolean;
}

export async function comparePassword(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  password: string,
  debug: boolean = false,
): Promise<ComparePasswordResult> {
  if (debug) {
    console.log(
      `[comparePassword] Attempting to compare input password against password saved in database`,
    );
  }

  try {
    const record = await getPasswordRecord(db, uid, debug);
    const matches: boolean = await verifyPassword({
      uid,
      password,
      savedHash: record.password,
      version: record.password_hash_version,
    });
    const needsUpgrade: boolean =
      matches &&
      doesStoredHashNeedUpgrade(record.password_hash_version, record.password);

    if (debug) {
      console.log(
        `[comparePassword] Password ${matches ? "is" : "is not"} the same` +
          (matches
            ? ` (stored version: ${record.password_hash_version}${
                needsUpgrade ? ", will be upgraded" : ""
              })`
            : ""),
      );
    }
    return { matches, needsUpgrade };
  } catch (e: unknown) {
    console.error(
      "[comparePassword] There was an error comparing passwords: ",
      e,
    );
    throw new Error("Error comparing passwords");
  }
}

export default comparePassword;
