import "server-only";

import { authenticator } from "otplib";

// One-step (±30 s) drift tolerance. With a 5-attempts-per-challenge cap
// (see challenge-store.ts) the per-challenge brute-force success
// probability stays at ≤ 5 × 3 / 1_000_000.
const TOTP_WINDOW = 1;

authenticator.options = { window: TOTP_WINDOW };

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

export function verifyTotpCode(args: {
  secret: string;
  code: string;
}): boolean {
  // otplib's verify returns false on malformed inputs rather than throwing.
  return authenticator.verify({ token: args.code, secret: args.secret });
}

export function generateTotpCodeForTesting(secret: string): string {
  return authenticator.generate(secret);
}
