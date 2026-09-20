import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthTokenTypes } from "@schemavaults/auth-common";
import type {
  DecodedTokenClaims,
  IsTokenRevokedFn,
} from "@schemavaults/auth-server-sdk/route_guards";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  isTokenRevoked,
  REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS,
} from "@/lib/auth-db/token-revocations";
import { isTokenIatRevoked } from "@/lib/auth-db/users/is-token-iat-revoked";
import type { RedisCache } from "@/lib/redis";
import { getUserTokensValidAfterCached } from "./user-tokens-valid-after-cache";

/**
 * The two revocation signals the auth server keeps, abstracted so the check
 * itself can be unit tested without Postgres/Redis.
 */
export interface TokenRevocationCheckDependencies {
  /** Explicit `jti` revocation (logout, refresh token rotation). */
  isJtiRevoked: (jti: string, type: AuthTokenTypes) => Promise<boolean>;
  /** Per-user `tokens_valid_after` watermark in unix seconds (`0` = unset). */
  getTokensValidAfter: (uid: string) => Promise<number>;
}

/**
 * Builds the `is_token_revoked` hook the route guards run against every
 * token that verified. A token is revoked when its `jti` has been revoked
 * OR its `iat` is older than the user's `tokens_valid_after` watermark.
 *
 * The watermark lookup is memoized per hook instance (one instance per
 * request), so a request presenting both a refresh and an access token
 * reads it once.
 */
export function buildTokenRevocationCheck(
  deps: TokenRevocationCheckDependencies,
): IsTokenRevokedFn {
  const watermarks = new Map<string, Promise<number>>();
  const getWatermark = (uid: string): Promise<number> => {
    let pending = watermarks.get(uid);
    if (!pending) {
      pending = deps.getTokensValidAfter(uid);
      watermarks.set(uid, pending);
      // Don't memoize failures: the next token re-attempts the lookup.
      pending.catch(() => watermarks.delete(uid));
    }
    return pending;
  };

  return async function isRouteGuardTokenRevoked(
    token: DecodedTokenClaims,
  ): Promise<boolean> {
    if (typeof token.jti === "string" && token.jti.length > 0) {
      if (await deps.isJtiRevoked(token.jti, token.type)) {
        return true;
      }
    }
    const tokens_valid_after: number = await getWatermark(token.uid);
    return isTokenIatRevoked(token.iat, tokens_valid_after);
  };
}

export interface CreateRouteGuardTokenRevocationCheckOptions {
  db: Kysely<AuthDatabase>;
  /**
   * When supplied, the per-user watermark is served from Redis (short TTL,
   * invalidated on every bump) so the guard hot path stays off Postgres.
   */
  redis?: RedisCache | null;
  debug?: boolean;
}

/**
 * The auth server's `is_token_revoked` hook for the SDK route guards,
 * backed by `token_revocations` (jti) and `users.tokens_valid_after` (iat).
 *
 * Refresh tokens get the same rotation-reuse grace window as the refresh
 * grant, so requests already in flight with the just-rotated cookie are not
 * failed; logout revocations (reason NULL) are always immediate, and access
 * tokens are never rotation-revoked so they get no grace at all.
 */
export function createRouteGuardTokenRevocationCheck({
  db,
  redis,
  debug = false,
}: CreateRouteGuardTokenRevocationCheckOptions): IsTokenRevokedFn {
  return buildTokenRevocationCheck({
    isJtiRevoked: (jti, type) =>
      isTokenRevoked(
        db,
        jti,
        type === "refresh"
          ? { rotationReuseGraceMs: REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS }
          : undefined,
      ),
    getTokensValidAfter: (uid) =>
      getUserTokensValidAfterCached(db, uid, redis, debug),
  });
}

export default createRouteGuardTokenRevocationCheck;
