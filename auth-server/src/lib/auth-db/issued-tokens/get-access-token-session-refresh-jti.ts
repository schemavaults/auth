import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

/**
 * The session an access token belongs to: the `jti` of the refresh token
 * minted in the same grant (`issued_tokens.refresh_jti`, migration 00039),
 * which logout and RFC 7009 revocation of that refresh token follow to
 * revoke the session's access tokens. Null when the access token has no
 * issuance row of `uid` (minted before issuance tracking, or its recording
 * failed) or was minted without a refresh token (client_credentials, a
 * delegated token of its own).
 *
 * The token exchange links a delegated token to its subject token's
 * session with it, so ending the user's session ends the agents' tokens
 * minted from it too.
 */
export async function getAccessTokenSessionRefreshJti(
  db: Kysely<AuthDatabase>,
  jti: string,
  uid: string,
): Promise<string | null> {
  if (!isValidUuid(jti)) {
    throw new TypeError("Invalid jti: expected a valid UUID");
  }
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const row = await db
    .selectFrom("issued_tokens")
    .select("refresh_jti")
    .where("jti", "=", jti)
    .where("uid", "=", uid)
    .where("token_type", "=", "access")
    .executeTakeFirst();

  return row?.refresh_jti ?? null;
}

export default getAccessTokenSessionRefreshJti;
