import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashPassword } from "@/lib/hash_password";
import { getPasswordHash } from "./get-password-hash";

export async function comparePassword(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  password: string,
  debug: boolean = false
): Promise<boolean> {
  if (debug) {
    console.log(
      `[comparePassword] Attempting to compare input password against password saved in database`,
    );
  }

  try {
    const hashes: [string, string] = await Promise.all([
      getPasswordHash(db, uid, debug),
      hashPassword(password),
    ]);
    // Timing-safe comparison of the two SHA-256 hex digests so that
    // response-time differences cannot be used to recover the saved hash.
    const truthBuf: Buffer = Buffer.from(hashes[0], "hex");
    const submittedBuf: Buffer = Buffer.from(hashes[1], "hex");
    const isSubmittedSameAsTruth: boolean =
      truthBuf.length === submittedBuf.length &&
      timingSafeEqual(truthBuf, submittedBuf);
    if (debug) {
      console.log(
        `[comparePassword] Password ${isSubmittedSameAsTruth ? "is" : "is not"} the same`,
      );
    }
    return isSubmittedSameAsTruth;
  } catch (e: unknown) {
    console.error(
      "[comparePassword] There was an error comparing passwords: ",
      e,
    );
    throw new Error("Error comparing passwords");
  }
}

export default comparePassword;
