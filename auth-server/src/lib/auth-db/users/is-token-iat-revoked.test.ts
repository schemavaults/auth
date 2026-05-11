import { describe, test, expect } from "bun:test";
import { isTokenIatRevoked } from "./is-token-iat-revoked";

describe("isTokenIatRevoked", () => {
  test("returns false when watermark is zero (column default)", () => {
    expect(isTokenIatRevoked(1_700_000_000, 0)).toBe(false);
  });

  test("returns false when watermark is negative", () => {
    expect(isTokenIatRevoked(1_700_000_000, -1)).toBe(false);
  });

  test("returns true when iat is strictly less than watermark", () => {
    expect(isTokenIatRevoked(1_700_000_000, 1_700_000_001)).toBe(true);
  });

  test("returns false when iat equals watermark", () => {
    // Tokens minted in the same second as the password reset are
    // accepted — strict less-than semantics.
    expect(isTokenIatRevoked(1_700_000_000, 1_700_000_000)).toBe(false);
  });

  test("returns false when iat is greater than watermark", () => {
    expect(isTokenIatRevoked(1_700_000_002, 1_700_000_001)).toBe(false);
  });

  test("returns false when iat is undefined", () => {
    expect(isTokenIatRevoked(undefined, 1_700_000_001)).toBe(false);
  });

  test("returns false when iat is NaN", () => {
    expect(isTokenIatRevoked(Number.NaN, 1_700_000_001)).toBe(false);
  });

  test("returns false when iat is Infinity", () => {
    expect(isTokenIatRevoked(Number.POSITIVE_INFINITY, 1_700_000_001)).toBe(
      false,
    );
  });

  test("returns false when watermark is NaN", () => {
    expect(isTokenIatRevoked(1_700_000_000, Number.NaN)).toBe(false);
  });
});
