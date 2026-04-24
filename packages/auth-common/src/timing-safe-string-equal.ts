/**
 * Timing-safe string comparison usable from browser bundles.
 *
 * `node:crypto.timingSafeEqual` is Node-only; this pure-JS variant
 * operates on strings and runs in both browser and server contexts.
 * Not strictly constant-time under every JIT, but avoids early-exit on
 * the first byte of divergence — strictly better than `===` for
 * CSRF-nonce / token comparison.
 *
 * Returns false on any non-string input or length mismatch.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default timingSafeStringEqual;
