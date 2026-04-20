import { describe, test, expect, spyOn } from "bun:test";
import {
  oauth2StateSchema,
  parseOAuth2StateOrNull,
} from "./oauth2-state-schema";

describe("oauth2StateSchema", () => {
  test("accepts a base64url-shaped 32-byte nonce (43 chars)", () => {
    const value = "a".repeat(43);
    expect(oauth2StateSchema.safeParse(value).success).toBe(true);
  });

  test("accepts a UUID v4", () => {
    const value = "550e8400-e29b-41d4-a716-446655440000";
    expect(oauth2StateSchema.safeParse(value).success).toBe(true);
  });

  test("accepts a short JWT-shaped value (dots allowed)", () => {
    const value = "eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.abc";
    expect(oauth2StateSchema.safeParse(value).success).toBe(true);
  });

  test("rejects empty strings", () => {
    expect(oauth2StateSchema.safeParse("").success).toBe(false);
  });

  test("rejects values over 512 chars", () => {
    expect(oauth2StateSchema.safeParse("a".repeat(513)).success).toBe(false);
    expect(oauth2StateSchema.safeParse("a".repeat(512)).success).toBe(true);
  });

  test("rejects control characters, CR, LF, and NUL", () => {
    expect(oauth2StateSchema.safeParse("abc\n").success).toBe(false);
    expect(oauth2StateSchema.safeParse("ab\x00c").success).toBe(false);
    expect(oauth2StateSchema.safeParse("ab\x7fc").success).toBe(false);
    expect(oauth2StateSchema.safeParse("ab\x1bc").success).toBe(false);
  });

  test("rejects non-ASCII characters", () => {
    expect(oauth2StateSchema.safeParse("café").success).toBe(false);
    expect(oauth2StateSchema.safeParse("🙂").success).toBe(false);
  });
});

describe("parseOAuth2StateOrNull", () => {
  test("returns the string for valid input", () => {
    expect(parseOAuth2StateOrNull("abc-123")).toBe("abc-123");
  });

  test("returns null for non-string input without logging", () => {
    expect(parseOAuth2StateOrNull(undefined)).toBeNull();
    expect(parseOAuth2StateOrNull(null)).toBeNull();
    expect(parseOAuth2StateOrNull(42)).toBeNull();
  });

  test("returns null for malformed input and warns", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(parseOAuth2StateOrNull("bad\nstate")).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
