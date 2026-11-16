import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getIssuedTokenSession } from "@/lib/auth-db/issued-tokens/get-issued-token-session";
import type { NewTokenRevocationRow } from "./token-revocations-table";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * Ends the SESSION the given refresh token belongs to: revokes every
 * unexpired token issued in it (`issued_tokens.session_id`, migration
 * 00056), whichever refresh of the rotation chain minted it:
 *
 *  - the access tokens minted alongside the refresh token and alongside
 *    every earlier (and, after a grace-window replay, parallel) refresh
 *    token of the chain;
 *  - the delegated tokens a client's agents were given in exchange for any
 *    of them, which the token exchange records in the same session;
 *  - the chain's other refresh tokens. Those a rotation already revoked
 *    lose their reuse grace window, so none can be redeemed after this.
 *
 * Used by logout and RFC 7009 revocation of a refresh token, so that ending
 * a session leaves none of its tokens usable, while the user's other
 * sessions (other apps, other devices) and any pending authorization code
 * stay untouched. Tokens recorded before sessions were (no `session_id`)
 * are still found by the refresh token they were minted with
 * (`refresh_jti`, migration 00039).
 *
 * The presented refresh token itself is revoked separately by the caller.
 * Returns the number of other tokens this call revoked (0 when none are
 * tracked).
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

  // A refresh token without an issuance row starts the session itself (the
  // refresh grant gives its replacements its own jti as their session).
  const session_id: string =
    (await getIssuedTokenSession(db, refresh_jti, uid))?.session_id ?? refresh_jti;

  const session_tokens = await db
    .selectFrom("issued_tokens")
    .leftJoin("token_revocations", "token_revocations.jti", "issued_tokens.jti")
    .select([
      "issued_tokens.jti",
      "issued_tokens.expires_at",
      "issued_tokens.token_type",
      "token_revocations.jti as revoked_jti",
      "token_revocations.reason as revocation_reason",
    ])
    .where("issued_tokens.uid", "=", uid)
    .where("issued_tokens.expires_at", ">", now)
    .where("issued_tokens.jti", "!=", refresh_jti)
    .where((eb) =>
      eb.or([
        eb("issued_tokens.session_id", "in", [session_id, refresh_jti]),
        eb("issued_tokens.refresh_jti", "in", [session_id, refresh_jti]),
      ]),
    )
    .execute();

  // Refresh tokens of the session that a rotation revoked stay redeemable
  // for a short reuse grace window; ending the session closes it.
  const rotated_refresh_jtis: string[] = [
    refresh_jti,
    ...session_tokens
      .filter((row) => row.revoked_jti !== null && row.revocation_reason === "rotation")
      .map((row) => row.jti),
  ];
  await db
    .updateTable("token_revocations")
    .set({ reason: null })
    .where("uid", "=", uid)
    .where("jti", "in", rotated_refresh_jtis)
    .where("reason", "=", "rotation")
    .execute();

  const rows: NewTokenRevocationRow[] = session_tokens
    .filter((row) => row.revoked_jti === null)
    .map((row) => ({
      jti: row.jti,
      uid,
      expires_at:
        typeof row.expires_at === "string"
          ? parseInt(row.expires_at, 10)
          : Number(row.expires_at),
      revoked_at: now,
      // Session ended: immediate, no rotation-reuse grace.
      reason: null,
    }));
  if (rows.length === 0) {
    return 0;
  }

  await db
    .insertInto("token_revocations")
    .values(rows)
    .onConflict((oc) => oc.column("jti").doNothing())
    .execute();

  return rows.length;
}

export default revokeTokensIssuedWithRefreshToken;
