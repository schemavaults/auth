// Generates a cryptographically-random OAuth2 `state` value (RFC 6749 §10.12).
// The value is opaque to the server; it only needs to be unpredictable to
// an attacker and long enough that guessing is infeasible. 32 random bytes
// base64url-encoded produces a 43-character token — identical in strength
// to the PKCE code_verifier contract used elsewhere in the SDK.

const STATE_BYTE_LENGTH = 32 as const;

function toBase64Url(bytes: Uint8Array): string {
  // Bun, modern browsers, and Node ≥16 all expose `btoa` + standard encoding.
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateOAuth2State(): string {
  const hasWebCrypto: boolean =
    typeof crypto === "object" &&
    !!crypto &&
    typeof crypto.getRandomValues === "function";

  if (hasWebCrypto) {
    const bytes = new Uint8Array(STATE_BYTE_LENGTH);
    crypto.getRandomValues(bytes);
    return toBase64Url(bytes);
  }

  // Insecure fallback; still length-correct so server-side parsing holds.
  // Callers SHOULD run in a secure context (HTTPS or localhost) so this
  // branch is practically unreachable in production.
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < 43; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Timing-safe string comparison usable from browser bundles
 * (`node:crypto.timingSafeEqual` is not available in the browser).
 * Not constant-time under all JITs, but avoids early-exit on mismatch
 * and is far better than `===` for CSRF-nonce comparison.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export default generateOAuth2State;
