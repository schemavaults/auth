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

export const REFRESH_TOKEN_RATE_LIMIT: RateLimitConfig = {
  name: "refresh-token",
  maxAttempts: 30,
  windowSeconds: 60,
  keySource: "ip",
};
