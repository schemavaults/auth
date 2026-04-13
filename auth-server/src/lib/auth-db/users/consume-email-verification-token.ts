import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function consumeEmailVerificationToken(
  db: Kysely<AuthDatabase>,
  tokenId: string,
  debug: boolean = false,
): Promise<void> {
  if (debug) {
    console.log(`[consumeEmailVerificationToken] Marking token ${tokenId} as used`);
  }

  await db
    .updateTable("email_verification_tokens")
    .set({ used_at: Date.now() })
    .where("token_id", "=", tokenId)
    .execute();
}

export default consumeEmailVerificationToken;
