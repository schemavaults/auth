import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function consumePasswordResetToken(
  db: Kysely<AuthDatabase>,
  tokenId: string,
  debug: boolean = false,
): Promise<void> {
  if (debug) {
    console.log(`[consumePasswordResetToken] Marking token ${tokenId} as used`);
  }

  await db
    .updateTable("password_reset_tokens")
    .set({ used_at: Date.now() })
    .where("token_id", "=", tokenId)
    .execute();
}

export default consumePasswordResetToken;
