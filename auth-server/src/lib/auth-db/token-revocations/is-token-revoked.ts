import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * How long a rotation-revoked refresh token remains redeemable after its
 * replacement was minted. Absorbs benign races — parallel tabs or
 * concurrent requests redeeming the same token before the rotated cookie
 * propagates — without leaving stolen tokens replayable indefinitely.
 */
export const REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS = 10_000 as const;

export interface IsTokenRevokedOptions {
  /**
   * When set, a token revoked with reason 'rotation' within the last
   * `rotationReuseGraceMs` milliseconds is NOT reported as revoked.
   * Only the refresh grants pass this; logout and administrative
   * revocations (reason NULL) are always immediate, and every other
   * caller sees rotation revocations immediately too.
   */
  rotationReuseGraceMs?: number;
}

export async function isTokenRevoked(
  db: Kysely<AuthDatabase>,
  jti: string,
  options?: IsTokenRevokedOptions,
): Promise<boolean> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }

  const row = await db
    .selectFrom("token_revocations")
    .where("jti", "=", jti)
    .select(["jti", "revoked_at", "reason"])
    .executeTakeFirst();
  if (row === undefined) {
    return false;
  }

  const grace: number | undefined = options?.rotationReuseGraceMs;
  if (
    typeof grace === "number" &&
    grace > 0 &&
    row.reason === "rotation" &&
    Date.now() - row.revoked_at < grace
  ) {
    return false;
  }

  return true;
}
