import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import { revokeTokensIssuedWithRefreshToken } from "./revoke-tokens-issued-with-refresh-token";

export interface EndSessionOfReusedRefreshTokenOptions {
  /** The `jti` of the presented (already rotated) refresh token. */
  jti: string;
  /** The user the refresh token was issued for. */
  uid: string;
  /**
   * The reuse grace window the refresh grant tolerates
   * (`REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS`). A rotation revocation younger
   * than this is a benign concurrent refresh, not a reuse.
   */
  rotation_reuse_grace_ms: number;
  /** Unix milliseconds; defaults to now. */
  now?: number;
}

export interface EndedReusedRefreshTokenSession {
  /** The other unexpired tokens of the session this call revoked. */
  revoked_tokens: number;
}

/**
 * Refresh token reuse detection (OAuth 2.1 §4.3.1, RFC 9700 §4.14.2): a
 * refresh token that a rotation revoked, presented again after the reuse
 * grace window, means two parties held it. The server cannot tell which of
 * them is the thief, so it ends the session the token belongs to
 * (`revokeTokensIssuedWithRefreshToken`): every refresh token of the
 * rotation chain, including the live one the other party holds, and every
 * access and delegated token minted in it.
 *
 * The presented token's revocation is claimed with a compare-and-set
 * (`reason` 'rotation' → NULL, only once its grace window is over), in the
 * same transaction as the session revocation. So:
 *
 *  - only a rotation revocation outside the grace window counts: logout,
 *    administrative and other revocations (reason NULL) are not reuse, and
 *    neither is a replay within the grace window;
 *  - of concurrent reuses, exactly one ends the session and gets a result
 *    (the caller records ONE audit event); the others get null;
 *  - once the session is ended, the token is an ordinary revoked token, and
 *    presenting it again is not reported again.
 *
 * Returns null when nothing was ended. A database failure throws and rolls
 * back the claim too, so a retried reuse tries again.
 */
export async function endSessionOfReusedRefreshToken(
  db: Kysely<AuthDatabase>,
  { jti, uid, rotation_reuse_grace_ms, now = Date.now() }: EndSessionOfReusedRefreshTokenOptions,
): Promise<EndedReusedRefreshTokenSession | null> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (
    typeof rotation_reuse_grace_ms !== "number" ||
    !Number.isFinite(rotation_reuse_grace_ms) ||
    rotation_reuse_grace_ms < 0
  ) {
    throw new TypeError("Invalid rotation_reuse_grace_ms: expected a non-negative finite number");
  }

  return db.transaction().execute(async (trx) => {
    const claimed = await trx
      .updateTable("token_revocations")
      .set({ reason: null })
      .where("jti", "=", jti)
      .where("uid", "=", uid)
      .where("reason", "=", "rotation")
      .where("revoked_at", "<=", now - rotation_reuse_grace_ms)
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) !== 1) {
      return null;
    }

    const revoked_tokens: number = await revokeTokensIssuedWithRefreshToken(trx, jti, uid, now);
    return { revoked_tokens };
  });
}

export default endSessionOfReusedRefreshToken;
