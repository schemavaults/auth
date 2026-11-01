import "server-only";

import { authenticator } from "otplib";

// One-step (±30 s) drift tolerance. With a 5-attempts-per-challenge cap
// (see challenge-store.ts) the per-challenge brute-force success
// probability stays at ≤ 5 × 3 / 1_000_000.
const TOTP_WINDOW = 1;

/** RFC 6238 time step length (X), in seconds: otplib's default. */
export const TOTP_STEP_SECONDS = 30;

authenticator.options = { window: TOTP_WINDOW, step: TOTP_STEP_SECONDS };

export const TOTP_ISSUER = "SchemaVaults";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(args: {
  account_label: string;
  secret: string;
  issuer?: string;
}): string {
  return authenticator.keyuri(
    args.account_label,
    args.issuer ?? TOTP_ISSUER,
    args.secret,
  );
}

/** The RFC 6238 time step (T) that the instant `at_ms` falls in. */
export function totpTimeStepAt(at_ms: number): number {
  return Math.floor(at_ms / 1000 / TOTP_STEP_SECONDS);
}

/**
 * Checks `code` against the secret within the ±1 step drift window and
 * returns the RFC 6238 time step (T) it matched, or null when it matches
 * none (otplib returns null for malformed codes rather than throwing).
 *
 * Matching alone does not authorize anything: a code stays valid for up to
 * three steps, so it must also be consumed against the factor's last
 * accepted step. Callers use `verifyAndConsumeTotpCode()`
 * (consume-totp-code.ts), which does both.
 */
export function matchTotpTimeStep(args: {
  secret: string;
  code: string;
  /** Verification instant in ms since the epoch (defaults to now). */
  at_ms?: number;
}): number | null {
  const at_ms = args.at_ms ?? Date.now();
  // Pin the epoch so the delta and the step it is added to come from the
  // same instant, even if a step boundary passes while this runs.
  const delta = authenticator
    .clone({ epoch: at_ms })
    .checkDelta(args.code, args.secret);
  if (delta === null) return null;
  return totpTimeStepAt(at_ms) + delta;
}

export function generateTotpCodeForTesting(
  secret: string,
  at_ms: number = Date.now(),
): string {
  return authenticator.clone({ epoch: at_ms }).generate(secret);
}
