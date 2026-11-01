// Node-side TOTP generation for the `computeTotpCode` task (cypress.config.ts).
//
// otplib's HMAC implementation depends on Node's `crypto.createHmac`, which
// doesn't exist inside Cypress's browser context, so codes are computed here.
//
// The auth server refuses a TOTP code whose time step the factor already
// accepted (RFC 6238 §5.2, `USER_MFA_FACTORS.last_used_totp_step`), so two
// codes computed for the same factor within one 30 s step would be refused
// the second time. This helper therefore never hands out the same step twice
// for a secret: it returns a code for the current step, or the next step once
// the current one is taken (the server accepts one step of drift either way),
// and waits for the next step to start only when both are taken.
//
// A spec that wants to replay a code must reuse the string it got, not
// compute it again.

import {
  NobleCryptoPlugin,
  ScureBase32Plugin,
  createGuardrails,
  generateSync as generateTotpSync,
} from "otplib";

// Crypto + base32 plugins for otplib v13's plugin-based API. The
// auth-server uses otplib's default settings (SHA-1 / 6 digits / 30 s
// period / Base32-encoded secret), so the no-arg defaults match here.
const totpCryptoPlugin = new NobleCryptoPlugin();
const totpBase32Plugin = new ScureBase32Plugin();

// otplib v12 (used by the auth-server) defaults to a 10-byte (80-bit)
// shared secret per RFC 4226's lower bound, but otplib v13 enforces the
// RFC 6238 recommendation of ≥ 16 bytes by default. Loosen the lower
// bound here so codes generated against the seeded test secret verify
// against the server-side check that issued it.
const totpTestGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

const TOTP_PERIOD_SECONDS = 30;

// Steps the auth server accepts ahead of its own clock (its drift window).
const ACCEPTED_FUTURE_STEPS = 1;

// Last time step handed out per secret, for the whole `cypress run`.
const lastStepBySecret = new Map<string, number>();

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function computeUnusedTotpCode(
  secret: string,
): Promise<string> {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("computeTotpCode requires a non-empty secret");
  }

  for (;;) {
    const now = currentStep();
    const last = lastStepBySecret.get(secret);
    const step = last === undefined ? now : Math.max(now, last + 1);
    if (step <= now + ACCEPTED_FUTURE_STEPS) {
      lastStepBySecret.set(secret, step);
      return generateTotpSync({
        secret,
        epoch: step * TOTP_PERIOD_SECONDS,
        crypto: totpCryptoPlugin,
        base32: totpBase32Plugin,
        guardrails: totpTestGuardrails,
      });
    }
    // Both the current and the next step were handed out already: wait for
    // the next step to begin (a little past the boundary).
    const nextStepStartsAtMs = (now + 1) * TOTP_PERIOD_SECONDS * 1000;
    await sleep(Math.max(0, nextStepStartsAtMs - Date.now()) + 100);
  }
}
