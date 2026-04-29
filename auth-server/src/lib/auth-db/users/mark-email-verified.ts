import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function markEmailVerified(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
  debug: boolean = false,
): Promise<void> {
  if (debug) {
    console.log(`[markEmailVerified] Marking email as verified for uid: ${uid}`);
  }

  await db
    .updateTable("users")
    .set({ email_verified: true })
    .where("uid", "=", uid)
    .execute();
}

export default markEmailVerified;
