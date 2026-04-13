import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { hashToken } from "./hash-token";

const EMAIL_VERIFICATION_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export async function createEmailVerificationToken(
  db: Kysely<AuthDatabase>,
  uid: string,
  debug: boolean = false,
): Promise<string> {
  const rawToken: string = crypto.randomUUID();
  const tokenHash: string = await hashToken(rawToken);
  const now: number = Date.now();

  if (debug) {
    console.log(`[createEmailVerificationToken] Creating verification token for uid: ${uid}`);
  }

  await db
    .insertInto("email_verification_tokens")
    .values({
      uid,
      token_hash: tokenHash,
      expires_at: now + EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
      created_at: now,
    })
    .executeTakeFirstOrThrow();

  return rawToken;
}

export default createEmailVerificationToken;
