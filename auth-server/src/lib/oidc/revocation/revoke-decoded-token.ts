import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import { accessTokenExpiry, refreshTokenExpiry } from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  revokeToken,
  revokeTokensIssuedWithRefreshToken,
} from "@/lib/auth-db/token-revocations";
import type { VerifiedRevocableToken } from "./types";

export interface RevokedTokens {
  /** Whether the presented token's own `jti` was revoked (false for legacy tokens without one). */
  revoked: boolean;
  /** Other unexpired tokens of a revoked refresh token's session, revoked with it. */
  sibling_access_tokens: number;
}

/**
 * Revokes a verified token issued to the requesting client, by `jti`:
 *
 *  - a refresh token together with every other token of its session
 *    (`issued_tokens.session_id`, as logout does), in one transaction: the
 *    access tokens minted with it and with the earlier refresh tokens of
 *    its rotation chain, and the delegated tokens exchanged for any of
 *    them. RFC 7009 §2.1 says the server SHOULD also invalidate the access
 *    tokens of the same grant.
 *  - an access token on its own: its `jti`, which /api/oidc/userinfo and
 *    introspection check.
 *
 * The revocation row outlives the token (at most a full token lifetime from
 * now). Revoking again is a no-op: revokeToken keeps the first row.
 */
export async function revokeDecodedToken(
  db: Kysely<AuthDatabase>,
  { kind, payload }: VerifiedRevocableToken,
  now: number = Date.now(),
): Promise<RevokedTokens> {
  const { jti, uid } = payload;
  if (!jti) {
    // Minted before jti tracking: there is no id to revoke it by.
    return { revoked: false, sibling_access_tokens: 0 };
  }

  if (kind === "access") {
    await revokeToken(db, jti, uid, now + accessTokenExpiry * 1000);
    return { revoked: true, sibling_access_tokens: 0 };
  }

  return db.transaction().execute(async (trx) => {
    await revokeToken(trx, jti, uid, now + refreshTokenExpiry * 1000);
    const sibling_access_tokens: number =
      await revokeTokensIssuedWithRefreshToken(trx, jti, uid, now);
    return { revoked: true, sibling_access_tokens };
  });
}

export default revokeDecodedToken;
