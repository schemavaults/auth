import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashPasswordV3, LATEST_PASSWORD_HASH_VERSION } from "@/lib/hash_password";

export async function updateUserPassword(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  newPlaintextPassword: string,
  debug: boolean = false,
): Promise<void> {
  if (debug) {
    console.log(`[updateUserPassword] Updating password for uid: ${uid}`);
  }

  const hashedPassword: string = await hashPasswordV3(newPlaintextPassword);

  await db
    .deleteFrom("passwords")
    .where("uid", "=", uid)
    .execute();

  await db
    .insertInto("passwords")
    .values({
      uid,
      password: hashedPassword,
      password_hash_version: LATEST_PASSWORD_HASH_VERSION,
      created_at: Date.now(),
    })
    .executeTakeFirstOrThrow();

  if (debug) {
    console.log(`[updateUserPassword] Password updated for uid: ${uid}`);
  }
}

export default updateUserPassword;
