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

/**
 * OAuth2 client_credentials grants at /api/oidc/token, per IP. Bounds
 * both client-secret guessing and runaway M2M minting loops; a
 * well-behaved service caches its access token for most of its
 * lifetime, so this budget is generous for legitimate traffic.
 */
export const CLIENT_CREDENTIALS_RATE_LIMIT: RateLimitConfig = {
  name: "client-credentials",
  maxAttempts: 60,
  windowSeconds: 60,
  keySource: "ip",
};

/**
 * RFC 8693 token exchanges (delegated tokens for agents) at
 * /api/oidc/token, per IP. Like client_credentials, a confidential
 * client can repeat it without user interaction; a client minting one
 * delegated token per agent session and re-exchanging before expiry stays
 * well inside it.
 */
export const TOKEN_EXCHANGE_RATE_LIMIT: RateLimitConfig = {
  name: "token-exchange",
  maxAttempts: 60,
  windowSeconds: 60,
  keySource: "ip",
};

/**
 * Anonymous RFC 7591 dynamic client registrations at
 * /api/oidc/register, per IP. Registration is unauthenticated and each
 * success creates database rows, so the budget is small: a legitimate
 * MCP client registers once and reuses its client_id.
 */
export const DYNAMIC_CLIENT_REGISTRATION_RATE_LIMIT: RateLimitConfig = {
  name: "dynamic-client-registration",
  maxAttempts: 10,
  windowSeconds: 60 * 60,
  keySource: "ip",
};

/**
 * Domain ownership checks at POST
 * /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}/verify, per
 * account and IP. Each check queries DNS for a name the caller chose, so
 * the budget bounds lookups an account can trigger; an owner waiting for
 * their record to propagate retries a few times.
 */
export const API_SERVER_DOMAIN_VERIFICATION_RATE_LIMIT: RateLimitConfig = {
  name: "api-server-domain-verification",
  maxAttempts: 20,
  windowSeconds: 60 * 60,
  keySource: "ip+uid",
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

/**
 * Client error reports at POST /api/client-errors/{client_app_id}, per IP.
 * The client SDK sends at most 25 reports per client instance, deduplicates
 * them and backs off on 429, so this only bounds abuse of the public intake.
 */
export const CLIENT_ERROR_REPORT_RATE_LIMIT: RateLimitConfig = {
  name: "client-error-report",
  maxAttempts: 20,
  windowSeconds: 60,
  keySource: "ip",
};

/**
 * Client error reports per client application per hour, across every IP:
 * a flood spread over many addresses (or a widespread bug) cannot store
 * more than this many reports for one app. Counted only for reports that
 * passed the app's origin check, so unknown app ids create no counters.
 */
export const CLIENT_ERROR_REPORT_APP_RATE_LIMIT: RateLimitConfig = {
  name: "client-error-report-app",
  maxAttempts: 1000,
  windowSeconds: 60 * 60,
  keySource: "client_app_id",
};

/**
 * RFC 8628 device authorization requests at POST
 * /api/oidc/device_authorization, per IP. Each one stores a pending request
 * the user may never complete, so the budget bounds how many a caller can
 * pile up (a device needs one per sign-in).
 */
export const DEVICE_AUTHORIZATION_RATE_LIMIT: RateLimitConfig = {
  name: "device-authorization",
  maxAttempts: 30,
  windowSeconds: 10 * 60,
  keySource: "ip",
};

/**
 * Device code polls of the token endpoint (grant_type=device_code), per IP.
 * A device polls every 5 seconds or slower (the token endpoint answers
 * faster polls with `slow_down`), so this leaves room for a few devices
 * behind one address while bounding a client that ignores `slow_down`.
 */
export const DEVICE_CODE_RATE_LIMIT: RateLimitConfig = {
  name: "device-code",
  maxAttempts: 120,
  windowSeconds: 60,
  keySource: "ip",
};

/**
 * Unknown user codes entered on the /device verification page, per
 * account and per IP: only misses count, so a user typing their code is
 * never slowed down, while guessing someone else's pending code (RFC 8628
 * §5.1) stops after a handful of tries. With 20^8 possible codes and a
 * 15-minute lifetime, these budgets make a guess hopeless.
 */
export const DEVICE_USER_CODE_MISS_UID_RATE_LIMIT: RateLimitConfig = {
  name: "device-user-code-miss-uid",
  maxAttempts: 10,
  windowSeconds: 15 * 60,
  keySource: "uid",
};

export const DEVICE_USER_CODE_MISS_IP_RATE_LIMIT: RateLimitConfig = {
  name: "device-user-code-miss-ip",
  maxAttempts: 30,
  windowSeconds: 15 * 60,
  keySource: "ip",
};
