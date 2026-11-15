// OAuth 2.0 Device Authorization Grant (RFC 8628) identifiers and timings,
// shared by the auth server's device authorization and token endpoints, its
// discovery document, its `/device` verification page and the SDK helpers
// that run the flow (`requestDeviceAuthorization()` in
// @schemavaults/auth-client-sdk, `startDeviceAuthorization()` in
// @schemavaults/auth-server-sdk/confidential-client).

/** RFC 8628 §3.4 `grant_type` of a device access token request. */
export const OAUTH_DEVICE_CODE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code" as const;

/**
 * Lifetime of a device authorization (its `device_code` and `user_code`),
 * in seconds: the `expires_in` of every device authorization response. The
 * user has this long to enter the code and approve the request.
 */
export const DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS = 15 * 60;

/**
 * The minimum number of seconds a client waits between polling requests
 * (RFC 8628 §3.2 `interval`; 5 is also the default a client assumes when
 * the response omits it).
 */
export const DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS = 5;

/**
 * RFC 8628 §3.5: on `slow_down` "the interval MUST be increased by 5 seconds
 * for this and all subsequent requests". The auth server adds it to the
 * interval it enforces, and clients add it to the one they wait.
 */
export const DEVICE_AUTHORIZATION_SLOW_DOWN_INCREMENT_SECONDS = 5;

/**
 * The auth server page where the user enters a user code (the
 * `verification_uri`, RFC 8628 §3.2), relative to the auth server URL.
 */
export const DEVICE_VERIFICATION_PATH = "/device" as const;

/** The query parameter of `verification_uri_complete` carrying the user code. */
export const DEVICE_VERIFICATION_USER_CODE_PARAM = "user_code" as const;

/**
 * The error codes of RFC 8628 §3.5 a device access token request may be
 * answered with, besides those of RFC 6749 §5.2:
 *
 * - `authorization_pending`: the user has not decided yet; poll again after
 *   the interval.
 * - `slow_down`: as `authorization_pending`, but the client polled too fast;
 *   add 5 seconds to its interval.
 * - `access_denied`: the user denied the request. Stop polling.
 * - `expired_token`: the device code expired. Stop polling; start over with
 *   a new device authorization request if the user still wants to.
 */
export const DEVICE_ACCESS_TOKEN_ERRORS = [
  "authorization_pending",
  "slow_down",
  "access_denied",
  "expired_token",
] as const;

export type DeviceAccessTokenError = (typeof DEVICE_ACCESS_TOKEN_ERRORS)[number];

/** Whether `error` is one of the RFC 8628 §3.5 device access token errors. */
export function isDeviceAccessTokenError(
  error: unknown,
): error is DeviceAccessTokenError {
  return (
    typeof error === "string" &&
    (DEVICE_ACCESS_TOKEN_ERRORS as readonly string[]).includes(error)
  );
}
