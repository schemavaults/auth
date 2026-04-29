// timingSafeEqualSecretString.ts
//
// Length-hiding constant-time string comparison. Both inputs are SHA-256
// hashed to fixed 32-byte digests before `timingSafeEqual`, so the wall-clock
// time of the comparison does not depend on the secret's length. Do not
// "simplify" this back to a `length` early-return + `timingSafeEqual` on raw
// bytes — that pattern leaks the configured secret's length via response
// time.

import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function timingSafeEqualSecretString(
  expected: string,
  supplied: string | null | undefined,
): boolean {
  if (typeof expected !== "string" || expected.length === 0) {
    return false;
  }
  const suppliedString: string = typeof supplied === "string" ? supplied : "";
  const expectedDigest: Buffer = sha256(expected);
  const suppliedDigest: Buffer = sha256(suppliedString);
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export default timingSafeEqualSecretString;
