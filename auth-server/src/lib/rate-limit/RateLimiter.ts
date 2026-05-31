import "server-only";

import type Redis from "ioredis";
import type {
  RateLimitConfig,
  RateLimitIdentifiers,
  RateLimitResult,
} from "./types";

function buildKey(
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): string {
  const prefix = `rl:${config.name}`;
  switch (config.keySource) {
    case "ip": {
      if (!identifiers.ip) {
        throw new Error(`Rate limit '${config.name}' requires ip`);
      }
      return `${prefix}:${identifiers.ip}`;
    }
    case "email": {
      if (!identifiers.email) {
        throw new Error(`Rate limit '${config.name}' requires email`);
      }
      return `${prefix}:${identifiers.email.toLowerCase()}`;
    }
    case "ip+email": {
      if (!identifiers.ip) {
        throw new Error(`Rate limit '${config.name}' requires ip`);
      }
      if (!identifiers.email) {
        throw new Error(`Rate limit '${config.name}' requires email`);
      }
      return `${prefix}:${identifiers.ip}:${identifiers.email.toLowerCase()}`;
    }
    case "uid": {
      if (!identifiers.uid) {
        throw new Error(`Rate limit '${config.name}' requires uid`);
      }
      return `${prefix}:${identifiers.uid}`;
    }
    case "ip+uid": {
      if (!identifiers.uid) {
        throw new Error(`Rate limit '${config.name}' requires uid`);
      }
      // IP is best-effort here: when it can't be determined we still bucket
      // per-uid so the per-account cap always applies.
      const ipPart = identifiers.ip ?? "unknown-ip";
      return `${prefix}:${ipPart}:${identifiers.uid}`;
    }
  }
}

const CHECK_AND_INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

function toResult(
  current: number,
  ttl: number,
  config: RateLimitConfig,
): RateLimitResult {
  const retryAfterSeconds = Math.max(ttl, 0);
  return {
    allowed: current <= config.maxAttempts,
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

export async function checkRateLimit(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<RateLimitResult> {
  try {
    const key = buildKey(config, identifiers);
    const result = (await redis.eval(
      CHECK_AND_INCREMENT_SCRIPT,
      1,
      key,
      String(config.windowSeconds),
    )) as [number, number];
    const [current, ttl] = result;
    return toResult(current, ttl, config);
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during checkRateLimit for '${config.name}':`, e);
    return allowedResult(config);
  }
}

export async function checkRateLimitCount(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<RateLimitResult> {
  try {
    const key = buildKey(config, identifiers);
    const [countStr, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    const current = countStr ? parseInt(countStr, 10) : 0;
    return toResult(current, ttl, config);
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during checkRateLimitCount for '${config.name}':`, e);
    return allowedResult(config);
  }
}

export async function incrementRateLimitCounter(
  redis: Redis,
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): Promise<void> {
  try {
    const key = buildKey(config, identifiers);
    await redis.eval(
      CHECK_AND_INCREMENT_SCRIPT,
      1,
      key,
      String(config.windowSeconds),
    );
  } catch (e: unknown) {
    console.error(`[rate-limit] Redis error during incrementRateLimitCounter for '${config.name}':`, e);
  }
}
