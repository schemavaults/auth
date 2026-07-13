// Generates a cryptographically-random login nonce (OIDC Core §3.1.2.1
// `nonce` semantics, applied uniformly to every SchemaVaults auth flow).
// The value is bound to the authorization-code row at login and echoed
// back — as an id_token claim on the OIDC surface and as a top-level
// `nonce` field in the custom token-exchange response — where the SDK
// verifies it against the value it stored, defending against replayed
// or substituted token responses.
//
// Mirrors generate-oauth2-state.ts: 32 random bytes base64url-encoded,
// with the encoding delegated to the platform adapter.

import type { Base64UrlEncoder } from "./generate-oauth2-state";

const NONCE_BYTE_LENGTH = 32 as const;

export function generateOidcNonce(
  toBase64UrlFromBytes: Base64UrlEncoder,
): string {
  if (typeof toBase64UrlFromBytes !== "function") {
    throw new TypeError(
      "generateOidcNonce requires a `toBase64UrlFromBytes` encoder (provided by the platform adapter)",
    );
  }

  const hasWebCrypto: boolean =
    typeof crypto === "object" &&
    !!crypto &&
    typeof crypto.getRandomValues === "function";

  if (hasWebCrypto) {
    const bytes = new Uint8Array(NONCE_BYTE_LENGTH);
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

export default generateOidcNonce;
