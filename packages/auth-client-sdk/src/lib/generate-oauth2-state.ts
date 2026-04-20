import { toBase64UrlFromBytes } from "@schemavaults/auth-common";

// Generates a cryptographically-random OAuth2 `state` value
// (RFC 6749 §10.12). The value is opaque to the server; it only needs
// to be unpredictable to an attacker. 32 random bytes base64url-encoded
// produces a 43-character token — equivalent in strength to the PKCE
// code_verifier contract used elsewhere in the SDK.

const STATE_BYTE_LENGTH = 32 as const;

export function generateOAuth2State(): string {
  const hasWebCrypto: boolean =
    typeof crypto === "object" &&
    !!crypto &&
    typeof crypto.getRandomValues === "function";

  if (hasWebCrypto) {
    const bytes = new Uint8Array(STATE_BYTE_LENGTH);
    crypto.getRandomValues(bytes);
    return toBase64UrlFromBytes(bytes);
  }

  // Insecure fallback; callers SHOULD run in a secure context
  // (HTTPS or localhost) so this branch is practically unreachable
  // in production. Length matches the secure path's base64url output.
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < 43; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export default generateOAuth2State;
