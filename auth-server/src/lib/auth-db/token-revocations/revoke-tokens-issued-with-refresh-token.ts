import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewTokenRevocationRow } from "./token-revocations-table";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * Revokes every unexpired token that was ISSUED ALONGSIDE the given refresh
 * token (the access tokens minted in the same grant — `issued_tokens.
 * refresh_jti`, migration 00039). Used by logout so that ending a session
 * kills that session's access tokens too, while leaving the user's other
 * sessions (other apps, other devices) and any pending authorization code
 * untouched.
 *
 * The refresh token itself is revoked separately by the caller. Returns the
 * number of sibling tokens revoked (0 when none are tracked, e.g. for
 * tokens issued before refresh_jti linkage existed).
 */
export async function revokeTokensIssuedWithRefreshToken(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  refresh_jti: string,
  uid: string,
  now: number = Date.now(),
): Promise<number> {
  if (!isValidUuid(refresh_jti)) {
    throw new TypeError("Invalid refresh_jti: expected a valid UUID");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const siblings = await db
    .selectFrom("issued_tokens")
    .select(["jti", "expires_at"])
    .where("refresh_jti", "=", refresh_jti)
    .where("uid", "=", uid)
    .where("expires_at", ">", now)
    .execute();

  if (siblings.length === 0) {
    return 0;
  }

  const rows: NewTokenRevocationRow[] = siblings.map((row) => ({
    jti: row.jti,
    uid,
    expires_at:
      typeof row.expires_at === "string"
        ? parseInt(row.expires_at, 10)
        : Number(row.expires_at),
    revoked_at: now,
    // Logout revocation: immediate, no rotation-reuse grace.
    reason: null,
  }));

  await db
    .insertInto("token_revocations")
    .values(rows)
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();

  return rows.length;
}

export default revokeTokensIssuedWithRefreshToken;
