import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

export interface IssuedTokenSession {
  /**
   * The session the token belongs to (`issued_tokens.session_id`, migration
   * 00056): the jti of the first refresh token of its rotation chain. For a
   * row recorded before the column existed, the refresh token it was minted
   * with. Null when the token belongs to no session on record.
   */
  session_id: string | null;
  /**
   * For an access token: the jti of the refresh token minted in the same
   * grant (`issued_tokens.refresh_jti`). Null for a refresh token.
   */
  refresh_jti: string | null;
}

/**
 * The session a token of `uid` was issued in, from its issuance row. Null
 * when it has none (minted before issuance tracking, its recording failed,
 * or the auth server's own sign-in cookie, which is not recorded).
 *
 * A refresh keeps its tokens in the presented refresh token's session with
 * it, and the token exchange puts a delegated token in its subject token's,
 * so ending the session (logout, RFC 7009 revocation of its refresh token)
 * revokes every token issued in it, whichever refresh minted them.
 */
export async function getIssuedTokenSession(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  jti: string,
  uid: string,
): Promise<IssuedTokenSession | null> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const row = await db
    .selectFrom("issued_tokens")
    .select(["session_id", "refresh_jti"])
    .where("jti", "=", jti)
    .where("uid", "=", uid)
    .executeTakeFirst();
  if (!row) {
    return null;
  }

  return {
    session_id: row.session_id ?? row.refresh_jti ?? null,
    refresh_jti: row.refresh_jti ?? null,
  };
}

export default getIssuedTokenSession;
