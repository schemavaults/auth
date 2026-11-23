import "server-only";

import type Redis from "ioredis";
import reportServerException from "@/lib/reportServerException";
import { buildRateLimitKey } from "./rate-limit-key";
import type {
  RateLimitConfig,
  RateLimitIdentifiers,
  RateLimitResult,
} from "./types";

/**
 * Fixed-window counter: INCR, and arm the window's expiry whenever the key
 * has none. Checking the TTL (rather than `current == 1`) also re-arms a
 * counter that somehow lost its expiry, which would otherwise refuse its
 * subject forever with `Retry-After: 0`.
 */
const CHECK_AND_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[1])
  redis.call('EXPIRE', KEYS[1], ttl)
end
return {current, ttl}
`;

/**
 * `current` is either the count including the request being checked
 * (`counted`: checkRateLimit, allowed while it is within the budget) or
 * the count so far (a failure-counted limit's peek: allowed while room is
 * left for one more, so a budget of N allows exactly N failures).
 */
function toResult(
  current: number,
  ttl: number,
  config: RateLimitConfig,
  counted: boolean,
): RateLimitResult {
  const retryAfterSeconds = Math.max(ttl, 0);
  return {
    allowed: counted ? current <= config.maxAttempts : current < config.maxAttempts,
    remaining: Math.max(0, config.maxAttempts - current),
    resetAt: Math.floor(Date.now() / 1000) + retryAfterSeconds,
    limit: config.maxAttempts,
    retryAfterSeconds,
  };
}

function allowedResult(config: RateLimitConfig): RateLimitResult {
  return {
    allowed: true,
    remaining: config.maxAttempts,
    resetAt: Math.floor(Date.now() / 1000) + config.windowSeconds,
    limit: config.maxAttempts,
    retryAfterSeconds: config.windowSeconds,
  };
}

/**
 * Rate limits fail open while Redis is unreachable, which silently turns
 * off brute-force protection: record it (once a minute per limiter, since
 * every request hits this path during an outage).
 */
async function recordRedisFailure(
  operation: string,
  config: RateLimitConfig,
  error: unknown,
): Promise<void> {
  await reportServerException(error, {
    op_name: `rateLimit.${operation}:${config.name}`,
    context: { limiter: config.name, fails_open: true },
    throttle_ms: 60_000,
  });
}

export async function checkRateLimit(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<RateLimitResult> {
  try {
    const key = buildRateLimitKey(config, identifiers);
    const result = (await redis.eval(
      CHECK_AND_INCREMENT_SCRIPT,
      1,
      key,
      String(config.windowSeconds),
    )) as [number, number];
    const [current, ttl] = result;
    return toResult(current, ttl, config, true);
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during checkRateLimit for '${config.name}':`, e);
    await recordRedisFailure("checkRateLimit", config, e);
    return allowedResult(config);
  }
}

export async function checkRateLimitCount(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<RateLimitResult> {
  try {
    const key = buildRateLimitKey(config, identifiers);
    const [countStr, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    const current = countStr ? parseInt(countStr, 10) : 0;
    return toResult(current, ttl, config, false);
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during checkRateLimitCount for '${config.name}':`, e);
    await recordRedisFailure("checkRateLimitCount", config, e);
    return allowedResult(config);
  }
}

export async function incrementRateLimitCounter(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<void> {
  try {
    const key = buildRateLimitKey(config, identifiers);
    await redis.eval(
      CHECK_AND_INCREMENT_SCRIPT,
      1,
      key,
      String(config.windowSeconds),
    );
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during incrementRateLimitCounter for '${config.name}':`, e);
    await recordRedisFailure("incrementRateLimitCounter", config, e);
  }
}

/**
 * Deletes a limit's counter for the given identifiers, ending its window
 * early (e.g. a completed password reset ends the account's login lockout).
 * Best effort, like the counters themselves.
 */
export async function clearRateLimitCounter(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<void> {
  try {
    await redis.del(buildRateLimitKey(config, identifiers));
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during clearRateLimitCounter for '${config.name}':`, e);
    await recordRedisFailure("clearRateLimitCounter", config, e);
  }
}
