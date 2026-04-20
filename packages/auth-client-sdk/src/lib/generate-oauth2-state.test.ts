import { describe, test, expect } from "bun:test";
import { generateOAuth2State } from "./generate-oauth2-state";

// Minimal test-only encoder mirroring what a browser adapter would ship.
// Keeping it inline avoids pulling @schemavaults/auth-common (or any
// other package) into the SDK's unit tests.
const testEncoder = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

describe("generateOAuth2State", () => {
  test("returns a base64url-alphabet string", () => {
    const state = generateOAuth2State(testEncoder);
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThanOrEqual(22);
    expect(/^[A-Za-z0-9_-]+$/.test(state)).toBe(true);
  });

  test("produces unique values across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 256; i++) {
      seen.add(generateOAuth2State(testEncoder));
    }
    // Any collision over 256 draws from ≥128 bits of entropy indicates
    // the RNG is broken.
    expect(seen.size).toBe(256);
  });

  test("throws if no encoder is supplied", () => {
    // @ts-expect-error intentional runtime misuse
    expect(() => generateOAuth2State(undefined)).toThrow();
  });
});
