import { describe, test, expect } from "bun:test";
import { generateOidcNonce } from "./generate-oidc-nonce";

// Minimal test-only encoder mirroring what a browser adapter would ship
// (same as generate-oauth2-state.test.ts).
const testEncoder = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

describe("generateOidcNonce", () => {
  test("returns a base64url-alphabet string", () => {
    const nonce = generateOidcNonce(testEncoder);
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThanOrEqual(22);
    expect(/^[A-Za-z0-9_-]+$/.test(nonce)).toBe(true);
  });

  test("produces unique values across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 256; i++) {
      seen.add(generateOidcNonce(testEncoder));
    }
    expect(seen.size).toBe(256);
  });

  test("throws if no encoder is supplied", () => {
    // @ts-expect-error intentional runtime misuse
    expect(() => generateOidcNonce(undefined)).toThrow();
  });
});
