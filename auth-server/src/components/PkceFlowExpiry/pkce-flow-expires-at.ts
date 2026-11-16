// When a third-party sign-in request (a PKCE authorization request) expires,
// from the `challenge_time` its flow carries on the URL. NOT server-only: the
// countdown on the login, register, consent and verify-email pages reads it
// from `useSearchParams()`.

import { MAX_PKCE_CODE_VERIFIER_AGE } from "@schemavaults/auth-common/pkce/code_verifier.js";

/**
 * How far ahead of the browser's clock a `challenge_time` may be and still
 * count (the requesting app's clock may run slightly ahead).
 */
const MAX_CHALLENGE_TIME_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The expiry (Unix epoch ms) of the sign-in request whose `challenge_time`
 * search parameter is `challenge_time_param`: `challenge_time` plus the PKCE
 * challenge's lifetime, after which the auth server refuses to mint its
 * authorization code. Null when the parameter is absent or not a plausible
 * time, so nothing is shown.
 */
export function pkceFlowExpiresAt(
  challenge_time_param: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (typeof challenge_time_param !== "string" || !/^\d{1,16}$/.test(challenge_time_param)) {
    return null;
  }
  const challenge_time: number = Number(challenge_time_param);
  if (!Number.isSafeInteger(challenge_time) || challenge_time <= 0) {
    return null;
  }
  if (challenge_time > now + MAX_CHALLENGE_TIME_CLOCK_SKEW_MS) {
    return null;
  }
  return challenge_time + MAX_PKCE_CODE_VERIFIER_AGE;
}

/** The lifetime a full countdown ring stands for. */
export const PKCE_FLOW_DURATION_MS: number = MAX_PKCE_CODE_VERIFIER_AGE;
