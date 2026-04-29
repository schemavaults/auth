import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * Conditionally marks an email verification token as consumed. The UPDATE
 * is guarded by `used_at IS NULL` so two concurrent callers cannot both
 * succeed. Returns `true` iff this call was the one that flipped the row;
 * `false` means the token was already consumed (lost the race, or already
 * used in a prior request).
 */
export async function consumeEmailVerificationToken(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  tokenId: string,
  debug: boolean = false,
): Promise<boolean> {
  if (debug) {
    console.log(`[consumeEmailVerificationToken] Marking token ${tokenId} as used`);
  }

  const updateResult = await db
    .updateTable("email_verification_tokens")
    .set({ used_at: Date.now() })
    .where("token_id", "=", tokenId)
    .where("used_at", "is", null)
    .executeTakeFirst();

  return (updateResult?.numUpdatedRows ?? BigInt(0)) > BigInt(0);
}

export default consumeEmailVerificationToken;
