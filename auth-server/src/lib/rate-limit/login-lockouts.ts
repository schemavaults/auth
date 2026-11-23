import "server-only";

import type Redis from "ioredis";
import type { RateLimitCheck } from "./check-rate-limits";
import { clearRateLimitCounter } from "./RateLimiter";
import { LOGIN_ACCOUNT_LOCKOUT, LOGIN_IP_LOCKOUT, LOGIN_LOCKOUT } from "./rate-limit-configs";

/**
 * The failure-counted limits of a password sign-in (see the configs): the
 * IP + address pair, the address from every IP, and the IP across every
 * address. POST /api/auth/login checks them all before the password and
 * counts a failure against them all after a 401.
 */
export function loginLockoutChecks(subject: { ip: string; email: string }): RateLimitCheck[] {
  const { ip, email } = subject;
  return [
    { config: LOGIN_LOCKOUT, identifiers: { ip, email } },
    { config: LOGIN_ACCOUNT_LOCKOUT, identifiers: { email } },
    { config: LOGIN_IP_LOCKOUT, identifiers: { ip } },
  ];
}

/**
 * Ends an account's login lockouts once its owner has proven control of the
 * address (a completed password reset): the account-wide one, and the one
 * of the IP + address pair when the reset came from a known IP. The IP's
 * own lockout across accounts stays: the reset says nothing about the other
 * accounts that IP tried.
 */
export async function clearLoginLockouts(
  redis: Redis,
  subject: { ip: string | null; email: string },
): Promise<void> {
  const { ip, email } = subject;
  await Promise.all([
    clearRateLimitCounter(redis, LOGIN_ACCOUNT_LOCKOUT, { email }),
    ip ? clearRateLimitCounter(redis, LOGIN_LOCKOUT, { ip, email }) : Promise.resolve(),
  ]);
}
