import { describe, test, expect } from "bun:test";
import {
  oauth2StateSchema,
  parseOAuth2State,
  OAuth2StateValidationError,
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

describe("parseOAuth2State", () => {
  test("returns the string for valid input", () => {
    expect(parseOAuth2State("abc-123")).toBe("abc-123");
  });

  test("returns null for absent input (null/undefined)", () => {
    expect(parseOAuth2State(undefined)).toBeNull();
    expect(parseOAuth2State(null)).toBeNull();
  });

  test("throws OAuth2StateValidationError for non-string types", () => {
    expect(() => parseOAuth2State(42)).toThrow(OAuth2StateValidationError);
    expect(() => parseOAuth2State(["a", "b"])).toThrow(
      OAuth2StateValidationError,
    );
    expect(() => parseOAuth2State({ state: "a" })).toThrow(
      OAuth2StateValidationError,
    );
  });

  test("throws OAuth2StateValidationError for empty string", () => {
    expect(() => parseOAuth2State("")).toThrow(OAuth2StateValidationError);
  });

  test("throws OAuth2StateValidationError for malformed content", () => {
    expect(() => parseOAuth2State("bad\nstate")).toThrow(
      OAuth2StateValidationError,
    );
    expect(() => parseOAuth2State("a".repeat(513))).toThrow(
      OAuth2StateValidationError,
    );
    expect(() => parseOAuth2State("café")).toThrow(OAuth2StateValidationError);
  });

  test("thrown error exposes the underlying zod reasons", () => {
    try {
      parseOAuth2State("bad\nstate");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OAuth2StateValidationError);
      expect((e as OAuth2StateValidationError).reasons.length).toBeGreaterThan(
        0,
      );
    }
  });
});
