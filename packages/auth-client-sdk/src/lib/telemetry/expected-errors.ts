import { TokenEndpointRequestFailedError } from "@/lib/oidc/oidc-token-error";

/**
 * RFC 8628 §3.5 outcomes of a device sign-in that are the user's doing, not
 * a fault: they denied the request, or let the code expire.
 */
const EXPECTED_DEVICE_AUTHORIZATION_ERRORS: ReadonlySet<string> = new Set([
  "access_denied",
  "expired_token",
]);

/**
 * Messages of errors the SDK throws as part of normal session lifecycle
 * (nobody is signed in, the session expired or was revoked). They are
 * surfaced to the app but not reported: they say nothing is broken.
 */
const EXPECTED_ERROR_MESSAGE_FRAGMENTS: readonly string[] = [
  "No refresh token available to acquire new access token",
  "Session expired: the auth server no longer recognizes this session",
  "Refresh token has expired",
  "refresh token expired!",
];

/** How many `cause` links are inspected. */
const MAX_CAUSE_DEPTH: number = 5;

/**
 * Whether `error` (or an error in its `cause` chain) is an expected session
 * lifecycle error, or a device sign-in the user denied or let expire.
 */
export function isExpectedAuthClientError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
    if (
      current instanceof TokenEndpointRequestFailedError &&
      current.oauth_error !== null &&
      EXPECTED_DEVICE_AUTHORIZATION_ERRORS.has(current.oauth_error)
    ) {
      return true;
    }
    const message: string = current.message;
    if (EXPECTED_ERROR_MESSAGE_FRAGMENTS.some((fragment: string): boolean => message.includes(fragment))) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
