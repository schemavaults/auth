import { describe, expect, test } from "bun:test";
import { accessTokenExpiry } from "@schemavaults/auth-common";
import {
  MIN_DELEGATED_TOKEN_LIFETIME_SECONDS,
  resolveDelegatedTokenExpiry,
} from "./resolve-delegated-token-expiry";

const NOW = 1_700_000_000_250; // unix ms, mid-second
const NOW_SECONDS = Math.floor(NOW / 1000);

describe("resolveDelegatedTokenExpiry", () => {
  test("the delegated token expires exactly when its subject token does", () => {
    const subject_token_exp = NOW_SECONDS + 600;
    expect(resolveDelegatedTokenExpiry({ subject_token_exp, now: NOW })).toEqual({
      ok: true,
      expires_at: subject_token_exp * 1000,
    });
  });

  test("a freshly minted subject token gives (at most) a full access-token lifetime", () => {
    const subject_token_exp = NOW_SECONDS + accessTokenExpiry;
    expect(resolveDelegatedTokenExpiry({ subject_token_exp, now: NOW })).toEqual({
      ok: true,
      expires_at: subject_token_exp * 1000,
    });
  });

  test("a subject token about to expire gives a delegated token about to expire, not a fresh lifetime", () => {
    const subject_token_exp = NOW_SECONDS + MIN_DELEGATED_TOKEN_LIFETIME_SECONDS + 1;
    const resolved = resolveDelegatedTokenExpiry({ subject_token_exp, now: NOW });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.expires_at - NOW).toBeLessThan((MIN_DELEGATED_TOKEN_LIFETIME_SECONDS + 1) * 1000);
    }
  });

  test(`refuses a subject token with less than ${MIN_DELEGATED_TOKEN_LIFETIME_SECONDS}s left as invalid_request`, () => {
    for (const subject_token_exp of [
      NOW_SECONDS + MIN_DELEGATED_TOKEN_LIFETIME_SECONDS - 1,
      NOW_SECONDS,
      NOW_SECONDS - 60,
    ]) {
      const resolved = resolveDelegatedTokenExpiry({ subject_token_exp, now: NOW });
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.error.error).toBe("invalid_request");
      }
    }
  });

  test("refuses a non-finite exp", () => {
    expect(resolveDelegatedTokenExpiry({ subject_token_exp: Number.NaN, now: NOW }).ok).toBe(false);
  });
});
