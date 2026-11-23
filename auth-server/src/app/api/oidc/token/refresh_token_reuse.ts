import "server-only";
import type { NextRequest } from "next/server";
import type { AppId } from "@schemavaults/app-definitions";
import {
  endSessionOfReusedRefreshToken,
  REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS,
  type EndedReusedRefreshTokenSession,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import recordAuditEvent from "@/lib/audit-log/record-audit-event";

export interface EndRotationChainOnReuseOptions {
  dbh: ServerlessDatabase;
  request: NextRequest;
  /** The presented refresh token's `jti`; the token is known to be revoked. */
  jti: string;
  uid: string;
  client_app_id: AppId;
  debug?: boolean;
}

/**
 * Called by the refresh grant for a presented refresh token that is
 * revoked. When a rotation revoked it longer ago than the reuse grace
 * window, the token was redeemed twice — by the legitimate client and by
 * someone who stole it, in either order — so the session it belongs to is
 * ended: every refresh token of the rotation chain (the live one included)
 * and every access and delegated token minted in it
 * (`endSessionOfReusedRefreshToken`). The account's `user.refresh_token_reused`
 * audit event records it, with the address of the request that presented
 * the token.
 *
 * Any other revocation (logout, administrative, an already ended session)
 * ends nothing and records nothing. Errors propagate: the token endpoint
 * records them and answers 500, and the claim rolls back, so a retry tries
 * again.
 */
export async function endRotationChainOnReuse({
  dbh,
  request,
  jti,
  uid,
  client_app_id,
  debug = false,
}: EndRotationChainOnReuseOptions): Promise<EndedReusedRefreshTokenSession | null> {
  const ended: EndedReusedRefreshTokenSession | null = await endSessionOfReusedRefreshToken(dbh.db, {
    jti,
    uid,
    rotation_reuse_grace_ms: REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS,
  });
  if (!ended) {
    return null;
  }

  if (debug) {
    console.warn(
      `[refresh_token grant] Refresh token jti '${jti}' of user '${uid}' was reused after rotation; ended its session (${ended.revoked_tokens} other token(s) revoked)`,
    );
  }

  await recordAuditEvent(dbh.db, {
    event_type: "user.refresh_token_reused",
    // The caller presented a token that two parties held: nobody we can
    // name as the one who did it.
    subject: { uid },
    client_app_id,
    request,
    details: { revoked_tokens: ended.revoked_tokens },
  });

  return ended;
}

export default endRotationChainOnReuse;
