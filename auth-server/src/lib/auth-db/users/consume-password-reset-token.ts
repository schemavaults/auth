import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * Conditionally marks a password reset token as consumed. The UPDATE is
 * guarded by `used_at IS NULL` so two concurrent callers cannot both
 * succeed. Returns `true` iff this call was the one that flipped the row;
 * `false` means the token was already consumed (lost the race, or already
 * used in a prior request).
 */
export async function consumePasswordResetToken(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  tokenId: string,
  debug: boolean = false,
): Promise<boolean> {
  if (debug) {
    console.log(`[consumePasswordResetToken] Marking token ${tokenId} as used`);
  }

  const updateResult = await db
    .updateTable("password_reset_tokens")
    .set({ used_at: Date.now() })
    .where("token_id", "=", tokenId)
    .where("used_at", "is", null)
    .executeTakeFirst();

  return (updateResult?.numUpdatedRows ?? BigInt(0)) > BigInt(0);
}

export default consumePasswordResetToken;
