import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISABLED_USER_TOKENS_VALID_AFTER,
  isTokenIatRevoked,
} from "./is-token-iat-revoked";

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

describe("DISABLED_USER_TOKENS_VALID_AFTER", () => {
  test("revokes every token a disabled account holds, whatever its iat", () => {
    const now = Math.floor(Date.now() / 1000);
    for (const iat of [1, 1_700_000_000, now, now + 1, now + 10 * 365 * 86_400]) {
      expect(isTokenIatRevoked(iat, DISABLED_USER_TOKENS_VALID_AFTER)).toBe(true);
    }
  });

  test("round-trips exactly through the BIGINT column's string form", () => {
    // Postgres returns BIGINT as a string; the readers parseInt it.
    expect(
      Number.parseInt(String(DISABLED_USER_TOKENS_VALID_AFTER), 10),
    ).toBe(DISABLED_USER_TOKENS_VALID_AFTER);
    expect(Number.isSafeInteger(DISABLED_USER_TOKENS_VALID_AFTER)).toBe(true);
  });

  test("matches the literal migration 00041 pins already-disabled accounts to", () => {
    const migration: string = readFileSync(
      join(import.meta.dir, "..", "migrations", "00041-disabled-users-revoke-tokens.ts"),
      "utf8",
    );
    expect(migration).toContain(
      `const DISABLED_USER_TOKENS_VALID_AFTER = "${DISABLED_USER_TOKENS_VALID_AFTER}";`,
    );
  });
});
