import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { validatePasswordResetToken } from "./validate-password-reset-token";
import { consumePasswordResetToken } from "./consume-password-reset-token";
import { updateUserPassword } from "./update-user-password";
import { invalidateAllTokensForUser } from "./invalidate-all-tokens-for-user";
import { tokensValidAfterRevokingAt } from "./is-token-iat-revoked";

export interface ConsumedPasswordResetToken {
  uid: string;
  /**
   * The user's new `tokens_valid_after` watermark (unix seconds): the first
   * second whose tokens are valid. Tokens minted before it, in the reset's
   * own second included, are revoked.
   */
  tokens_valid_after: number;
}

/**
 * Atomically validates a password reset token, marks it consumed, and
 * writes the new password — all inside a single database transaction.
 *
 * The conditional consume UPDATE (guarded by `used_at IS NULL`) is the
 * single-source-of-truth for single-use: if a concurrent request consumed
 * the token between our SELECT and our UPDATE, the consume returns
 * `false` and we abort *before* hashing or writing the new password. If
 * the password write fails, the transaction rolls back and the token
 * remains valid for a legitimate retry.
 *
 * Returns `{ uid, tokens_valid_after }` on success, `null` for every
 * reject case (token not found, expired, already consumed, or lost-race).
 */
export async function validateAndConsumePasswordResetToken(
  db: Kysely<AuthDatabase>,
  rawToken: string,
  newPlaintextPassword: string,
  debug: boolean = false,
): Promise<ConsumedPasswordResetToken | null> {
  return await db.transaction().execute(async (trx) => {
    const valid = await validatePasswordResetToken(trx, rawToken, debug);
    if (!valid) return null;

    const consumed = await consumePasswordResetToken(trx, valid.token_id, debug);
    if (!consumed) {
      if (debug) {
        console.warn(
          "[validateAndConsumePasswordResetToken] Lost race to consume token",
        );
      }
      return null;
    }

    await updateUserPassword(trx, valid.uid, newPlaintextPassword, debug);

    // Revoke every token previously issued for this uid by bumping the
    // per-user `tokens_valid_after` watermark. Inside the same transaction
    // as the password write so a stolen refresh token cannot outlive the
    // password change. The watermark is past the current second: a token
    // minted in it (e.g. by a refresh racing this transaction) is revoked
    // too, since `iat` cannot tell whether it came before the reset.
    const tokens_valid_after: number = tokensValidAfterRevokingAt(Date.now());
    await invalidateAllTokensForUser(trx, valid.uid, tokens_valid_after, debug);

    return { uid: valid.uid, tokens_valid_after };
  });
}

export default validateAndConsumePasswordResetToken;
