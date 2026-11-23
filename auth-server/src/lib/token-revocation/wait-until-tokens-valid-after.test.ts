import { describe, expect, test } from "bun:test";
import { tokensValidAfterRevokingAt } from "@/lib/auth-db/users/is-token-iat-revoked";
import {
  MAX_TOKENS_VALID_AFTER_WAIT_MS,
  waitUntilTokensValidAfter,
} from "./wait-until-tokens-valid-after";

function fakeClock(start_ms: number) {
  let now_ms = start_ms;
  const sleeps: number[] = [];
  return {
    now: () => now_ms,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now_ms += ms;
    },
    sleeps,
    get now_ms() {
      return now_ms;
    },
  };
}

describe("waitUntilTokensValidAfter", () => {
  test("waits out the rest of the revoked second, so a sign-in that follows mints valid tokens", async () => {
    const reset_at = 1_700_000_000_250;
    const watermark = tokensValidAfterRevokingAt(reset_at);
    const clock = fakeClock(reset_at + 50);

    const waited = await waitUntilTokensValidAfter(watermark, clock);

    expect(waited).toBe(700);
    expect(clock.sleeps).toEqual([700]);
    // The next token is minted with an iat the watermark accepts.
    expect(Math.floor(clock.now_ms / 1000)).toBe(watermark);
  });

  test("does not wait once the watermark second has begun", async () => {
    const clock = fakeClock(1_700_000_001_000);
    expect(await waitUntilTokensValidAfter(1_700_000_001, clock)).toBe(0);
    expect(await waitUntilTokensValidAfter(1_700_000_000, clock)).toBe(0);
    expect(clock.sleeps).toEqual([]);
  });

  test("never waits longer than a second, nor for a missing or pinned watermark", async () => {
    const clock = fakeClock(1_700_000_000_000);
    expect(await waitUntilTokensValidAfter(1_700_000_005, clock)).toBe(0);
    expect(await waitUntilTokensValidAfter(Number.MAX_SAFE_INTEGER, clock)).toBe(0);
    expect(await waitUntilTokensValidAfter(0, clock)).toBe(0);
    expect(await waitUntilTokensValidAfter(Number.NaN, clock)).toBe(0);
    expect(clock.sleeps).toEqual([]);
    expect(MAX_TOKENS_VALID_AFTER_WAIT_MS).toBe(1_000);
  });
});
