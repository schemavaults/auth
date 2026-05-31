import "server-only";

import type { RateLimitConfig } from "./types";

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  name: "login",
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  keySource: "ip+email",
};

export const LOGIN_LOCKOUT: RateLimitConfig = {
  name: "login-lockout",
  maxAttempts: 10,
  windowSeconds: 30 * 60,
  keySource: "ip+email",
};

export const REGISTER_RATE_LIMIT: RateLimitConfig = {
  name: "register",
  maxAttempts: 3,
  windowSeconds: 60 * 60,
  keySource: "ip",
};

export const RESET_PASSWORD_REQUEST_RATE_LIMIT: RateLimitConfig = {
  name: "reset-pwd-req",
  maxAttempts: 3,
  windowSeconds: 60 * 60,
  keySource: "email",
};

export const RESET_PASSWORD_CONFIRM_RATE_LIMIT: RateLimitConfig = {
  name: "reset-pwd-confirm",
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  keySource: "ip",
};

export const VERIFY_EMAIL_CONFIRM_RATE_LIMIT: RateLimitConfig = {
  name: "verify-email-confirm",
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  keySource: "ip",
};

export const REFRESH_TOKEN_RATE_LIMIT: RateLimitConfig = {
  name: "refresh-token",
  maxAttempts: 30,
  windowSeconds: 60,
  keySource: "ip",
};

// Caps cross-challenge MFA verify abuse from a single IP. Per-challenge
// attempts are independently capped at 5 by challenge-store.ts; this
// limiter exists to prevent a bot from rotating challenge_ids to evade
// the per-challenge cap.
export const MFA_VERIFY_RATE_LIMIT: RateLimitConfig = {
  name: "mfa-verify",
  maxAttempts: 20,
  windowSeconds: 60 * 60,
  keySource: "ip",
};

// Caps enrollment churn so an attacker who obtains a valid session
// cannot rapidly cycle through factors.
export const MFA_ENROLL_RATE_LIMIT: RateLimitConfig = {
  name: "mfa-enroll",
  maxAttempts: 10,
  windowSeconds: 60 * 60,
  keySource: "ip",
};

// Authenticated WebAuthn/passkey management routes. Keyed by ip+uid so each
// account is throttled (and can't dodge the cap by rotating IPs) while a
// shared IP can't exhaust another user's bucket. Enrollment options +
// verify-enrollment share the "enroll" bucket; step-up assertion options use
// their own.
export const WEBAUTHN_ENROLL_RATE_LIMIT: RateLimitConfig = {
  name: "webauthn-enroll",
  maxAttempts: 10,
  windowSeconds: 60,
  keySource: "ip+uid",
};

export const WEBAUTHN_STEP_UP_RATE_LIMIT: RateLimitConfig = {
  name: "webauthn-step-up",
  maxAttempts: 10,
  windowSeconds: 60,
  keySource: "ip+uid",
};
