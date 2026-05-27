// Browser-only helpers for shuttling the MFA factor list between the
// login form and the downstream /auth/mfa challenge page. The login form
// receives `available_factors` + `recovery_codes_available` in the
// `mfa_required` response, stashes them here keyed by challenge_id, and
// the MFA page reads them back to render the picker — no second server
// round-trip required.
//
// sessionStorage is tab-scoped and survives page refresh within the same
// tab, which matches the lifetime of an in-flight MFA challenge.

import {
  mfaChallengeFactorsPayloadSchema,
  type MfaChallengeFactorsPayload,
} from "@schemavaults/auth-common";

const KEY_PREFIX = "mfa-challenge-factors:";

function storageKey(challenge_id: string): string {
  return `${KEY_PREFIX}${challenge_id}`;
}

export function setMfaChallengeFactorsInSession(
  challenge_id: string,
  payload: MfaChallengeFactorsPayload,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(challenge_id),
      JSON.stringify(payload),
    );
  } catch (e: unknown) {
    console.warn(
      "[mfa-challenge-factors] failed to write sessionStorage:",
      e,
    );
  }
}

export function getMfaChallengeFactorsFromSession(
  challenge_id: string,
): MfaChallengeFactorsPayload | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(storageKey(challenge_id));
  } catch (e: unknown) {
    console.warn(
      "[mfa-challenge-factors] failed to read sessionStorage:",
      e,
    );
    return null;
  }
  if (!raw) return null;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = mfaChallengeFactorsPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) return null;
  return parsed.data;
}

export function clearMfaChallengeFactorsFromSession(
  challenge_id: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(challenge_id));
  } catch {
    // best-effort
  }
}
