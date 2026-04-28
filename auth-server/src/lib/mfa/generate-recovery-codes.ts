import "server-only";

import { randomBytes } from "node:crypto";

// Crockford-style alphabet (no I/L/O/U) so codes are unambiguous when
// hand-typed off paper or a screenshot.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const RECOVERY_CODE_GROUP_LENGTH = 5;
export const RECOVERY_CODE_GROUPS = 2; // → 10 chars, ~50 bits entropy
export const RECOVERY_CODE_COUNT = 10;

function makeCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_GROUP_LENGTH * RECOVERY_CODE_GROUPS);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    if (i > 0 && i % RECOVERY_CODE_GROUP_LENGTH === 0) out += "-";
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const code = makeCode();
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
