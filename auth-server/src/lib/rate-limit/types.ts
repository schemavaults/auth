import "server-only";

export type RateLimitKeySource = "ip" | "email" | "ip+email";

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
  readonly ip: string;
  readonly email?: string;
}
