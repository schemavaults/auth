import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { validateEmailVerificationToken } from "./validate-email-verification-token";
import { consumeEmailVerificationToken } from "./consume-email-verification-token";
import { markEmailVerified } from "./mark-email-verified";

/**
 * Atomically validates an email verification token, marks it consumed,
 * and flips `users.email_verified` — all inside a single database
 * transaction.
 *
 * The conditional consume UPDATE (guarded by `used_at IS NULL`) is the
 * single-source-of-truth for single-use: if a concurrent request consumed
 * the token between our SELECT and our UPDATE, the consume returns
 * `false` and we abort *before* writing `email_verified`. If the
 * `email_verified` write fails, the transaction rolls back and the token
 * remains valid for a legitimate retry.
 *
 * Returns `{ uid }` on success, `null` for every reject case (token not
 * found, expired, already consumed, or lost-race).
 */
export async function validateAndConsumeEmailVerificationToken(
  db: Kysely<AuthDatabase>,
  rawToken: string,
  debug: boolean = false,
): Promise<{ uid: string } | null> {
  return await db.transaction().execute(async (trx) => {
    const valid = await validateEmailVerificationToken(trx, rawToken, debug);
    if (!valid) return null;

    const consumed = await consumeEmailVerificationToken(
      trx,
      valid.token_id,
      debug,
    );
    if (!consumed) {
      if (debug) {
        console.warn(
          "[validateAndConsumeEmailVerificationToken] Lost race to consume token",
        );
      }
      return null;
    }

    await markEmailVerified(trx, valid.uid, debug);
    return { uid: valid.uid };
  });
}

export default validateAndConsumeEmailVerificationToken;
