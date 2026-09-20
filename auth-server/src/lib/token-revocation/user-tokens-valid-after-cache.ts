import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getUserTokensValidAfter } from "@/lib/auth-db/users/get-user-tokens-valid-after";
import isValidUuid from "@/lib/is-valid-uuid";
import type { RedisCache } from "@/lib/redis";

/**
 * How long a user's `tokens_valid_after` watermark may be served from Redis
 * before it is re-read from Postgres. Writers (logout, password reset) delete
 * the key as soon as they bump the watermark, so this TTL only bounds the
 * staleness window of a read that raced such a write — it is NOT how long a
 * revocation takes to apply.
 */
export const USER_TOKENS_VALID_AFTER_CACHE_TTL_SECONDS = 30 as const;

export function userTokensValidAfterCacheKey(uid: string): string {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  return `auth:user-tokens-valid-after:${uid}`;
}

/**
 * Reads the per-user `tokens_valid_after` watermark (unix seconds; `0` when
 * never set), serving it from Redis when a connection is supplied so the
 * route guards' hot path stays off the database. Postgres remains the source
 * of truth: any Redis failure falls back to a direct read.
 */
export async function getUserTokensValidAfterCached(
  db: Kysely<AuthDatabase>,
  uid: string,
  redis?: RedisCache | null,
  debug: boolean = false,
): Promise<number> {
  const key: string = userTokensValidAfterCacheKey(uid);

  if (redis) {
    try {
      const cached: string | null = await redis.client.get(key);
      if (cached !== null) {
        const parsed: number = Number.parseInt(cached, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    } catch (e: unknown) {
      console.warn(
        `[getUserTokensValidAfterCached] Redis read failed for uid '${uid}'; falling back to the database:`,
        e,
      );
    }
  }

  const watermark: number = await getUserTokensValidAfter(db, uid);

  if (redis) {
    try {
      await redis.client.set(
        key,
        String(watermark),
        "EX",
        USER_TOKENS_VALID_AFTER_CACHE_TTL_SECONDS,
      );
    } catch (e: unknown) {
      if (debug) {
        console.warn(
          `[getUserTokensValidAfterCached] Redis write failed for uid '${uid}':`,
          e,
        );
      }
    }
  }

  return watermark;
}

/**
 * Drops the cached watermark for a user. Call right after bumping
 * `tokens_valid_after` (logout, password reset) so the route guards see the
 * new value immediately instead of after the cache TTL. Never throws: a
 * failed invalidation only means the TTL bounds the staleness window.
 */
export async function invalidateUserTokensValidAfterCache(
  redis: RedisCache | null | undefined,
  uid: string,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.client.del(userTokensValidAfterCacheKey(uid));
  } catch (e: unknown) {
    console.warn(
      `[invalidateUserTokensValidAfterCache] Failed to drop cached watermark for uid '${uid}' (stale for at most ${USER_TOKENS_VALID_AFTER_CACHE_TTL_SECONDS}s):`,
      e,
    );
  }
}
