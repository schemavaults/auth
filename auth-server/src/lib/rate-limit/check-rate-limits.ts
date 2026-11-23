import "server-only";

import type Redis from "ioredis";
import {
  checkRateLimit,
  checkRateLimitCount,
  incrementRateLimitCounter,
} from "./RateLimiter";
import type { RateLimitConfig, RateLimitIdentifiers, RateLimitResult } from "./types";

/** One limit and the subject it is counted for. */
export interface RateLimitCheck {
  readonly config: RateLimitConfig;
  readonly identifiers: RateLimitIdentifiers;
}

/**
 * Counts a request against each limit in order and returns the first one it
 * exceeds, or null when every limit allows it. The limits after a refusing
 * one are not counted, so a refused request does not spend their budgets.
 */
export async function checkRateLimits(
  redis: Redis,
  checks: readonly RateLimitCheck[],
): Promise<RateLimitResult | null> {
  for (const { config, identifiers } of checks) {
    const result: RateLimitResult = await checkRateLimit(redis, config, identifiers);
    if (!result.allowed) return result;
  }
  return null;
}

/**
 * For failure-counted limits (lockouts): returns the first limit whose
 * budget is already spent, or null. Reads the counters without counting the
 * request; count a failure afterwards with `incrementRateLimitCounters()`.
 */
export async function checkRateLimitCounts(
  redis: Redis,
  checks: readonly RateLimitCheck[],
): Promise<RateLimitResult | null> {
  const results: RateLimitResult[] = await Promise.all(
    checks.map(({ config, identifiers }) => checkRateLimitCount(redis, config, identifiers)),
  );
  return results.find((result: RateLimitResult): boolean => !result.allowed) ?? null;
}

/** Counts one failure against each failure-counted limit. */
export async function incrementRateLimitCounters(
  redis: Redis,
  checks: readonly RateLimitCheck[],
): Promise<void> {
  await Promise.all(
    checks.map(({ config, identifiers }) => incrementRateLimitCounter(redis, config, identifiers)),
  );
}
