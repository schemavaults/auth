import "server-only";

export type RateLimitKeySource =
  | "ip"
  | "email"
  | "ip+email"
  | "uid"
  | "ip+uid";

export interface RateLimitConfig {
  readonly name: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
  readonly keySource: RateLimitKeySource;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  readonly limit: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitIdentifiers {
  // Optional so uid-only buckets work when no client IP is available; key
  // sources that need a given field assert its presence in buildKey().
  readonly ip?: string;
  readonly email?: string;
  // Authenticated subject. Used by uid / ip+uid key sources so per-account
  // limits can't be shared or bypassed across IPs.
  readonly uid?: string;
}
