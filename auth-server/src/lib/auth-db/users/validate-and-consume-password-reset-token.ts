import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { validatePasswordResetToken } from "./validate-password-reset-token";
import { consumePasswordResetToken } from "./consume-password-reset-token";
import { updateUserPassword } from "./update-user-password";

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
 * Returns `{ uid }` on success, `null` for every reject case (token not
 * found, expired, already consumed, or lost-race).
 */
export async function validateAndConsumePasswordResetToken(
  db: Kysely<AuthDatabase>,
  rawToken: string,
  newPlaintextPassword: string,
  debug: boolean = false,
): Promise<{ uid: string } | null> {
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
    return { uid: valid.uid };
  });
}

export default validateAndConsumePasswordResetToken;
