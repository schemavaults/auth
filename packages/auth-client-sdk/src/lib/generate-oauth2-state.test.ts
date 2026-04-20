import { describe, test, expect } from "bun:test";
import {
  generateOAuth2State,
  constantTimeStringEqual,
} from "./generate-oauth2-state";

describe("generateOAuth2State", () => {
  test("returns a base64url-alphabet string", () => {
    const state = generateOAuth2State();
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThanOrEqual(22);
    expect(/^[A-Za-z0-9_-]+$/.test(state)).toBe(true);
  });

  test("produces unique values across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 256; i++) {
      seen.add(generateOAuth2State());
    }
    // Any collision over 256 draws from ≥128 bits of entropy indicates
    // the RNG is broken.
    expect(seen.size).toBe(256);
  });
});

describe("constantTimeStringEqual", () => {
  test("returns true for identical strings", () => {
    expect(constantTimeStringEqual("abc", "abc")).toBe(true);
    const s = generateOAuth2State();
    expect(constantTimeStringEqual(s, s)).toBe(true);
  });

  test("returns false for mismatched strings of equal length", () => {
    expect(constantTimeStringEqual("abc", "abd")).toBe(false);
  });

  test("returns false for strings of differing lengths", () => {
    expect(constantTimeStringEqual("abc", "abcd")).toBe(false);
  });

  test("returns false for non-string inputs", () => {
    // @ts-expect-error intentional runtime misuse
    expect(constantTimeStringEqual(null, "abc")).toBe(false);
    // @ts-expect-error intentional runtime misuse
    expect(constantTimeStringEqual("abc", undefined)).toBe(false);
  });
});
