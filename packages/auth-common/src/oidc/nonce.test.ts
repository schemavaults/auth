import { describe, expect, test } from "bun:test";
import { OidcNonceValidationError, parseOidcNonce } from "./nonce";

describe("parseOidcNonce", () => {
  test("returns null for absent values", () => {
    expect(parseOidcNonce(undefined)).toBeNull();
    expect(parseOidcNonce(null)).toBeNull();
  });

  test("returns well-formed nonces untouched", () => {
    const uuid = "0b9c9c1e-9df1-4f4e-a8f1-2f2f9a3f4b5c";
    expect(parseOidcNonce(uuid)).toBe(uuid);
    const base64url = "n-0S6_WzA2Mj";
    expect(parseOidcNonce(base64url)).toBe(base64url);
  });

  test("throws on malformed values", () => {
    expect(() => parseOidcNonce("")).toThrow(OidcNonceValidationError);
    expect(() => parseOidcNonce(123)).toThrow(OidcNonceValidationError);
    expect(() => parseOidcNonce(["a"])).toThrow(OidcNonceValidationError);
    expect(() => parseOidcNonce("a".repeat(513))).toThrow(
      OidcNonceValidationError,
    );
    expect(() => parseOidcNonce("line\nbreak")).toThrow(
      OidcNonceValidationError,
    );
  });
});
