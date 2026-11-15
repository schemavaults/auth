import { describe, expect, test } from "bun:test";
import {
  FLOW_EXPIRY_CRITICAL_MS,
  FLOW_EXPIRY_WARNING_MS,
  describeFlowExpiry,
} from "./describe-flow-expiry";

const NOW = 1_700_000_000_000;
const MINUTE = 60 * 1000;

describe("describeFlowExpiry", () => {
  test("a fresh flow has a full ring", () => {
    const expiry = describeFlowExpiry({
      now: NOW,
      expires_at: NOW + 15 * MINUTE,
      duration_ms: 15 * MINUTE,
    });
    expect(expiry.fraction).toBe(1);
    expect(expiry.expired).toBe(false);
    expect(expiry.tone).toBe("default");
    expect(expiry.compact_label).toBe("15m");
    expect(expiry.spoken_label).toBe("about 15 minutes");
  });

  test("the ring empties in proportion to the lifetime", () => {
    const expiry = describeFlowExpiry({
      now: NOW,
      expires_at: NOW + 5 * MINUTE,
      duration_ms: 20 * MINUTE,
    });
    expect(expiry.fraction).toBe(0.25);
  });

  test("without a duration, the fallback lifetime is used, then the time left", () => {
    expect(
      describeFlowExpiry({
        now: NOW,
        expires_at: NOW + 3 * MINUTE,
        fallback_duration_ms: 6 * MINUTE,
      }).fraction,
    ).toBe(0.5);
    expect(
      describeFlowExpiry({ now: NOW, expires_at: NOW + 3 * MINUTE }).fraction,
    ).toBe(1);
  });

  test("labels count down in minutes and seconds near the end", () => {
    const at = (remaining_ms: number) =>
      describeFlowExpiry({
        now: NOW,
        expires_at: NOW + remaining_ms,
        duration_ms: 60 * MINUTE,
      });
    expect(at(60 * MINUTE).compact_label).toBe("1h");
    expect(at(60 * MINUTE).spoken_label).toBe("about 1 hour");
    expect(at(59 * MINUTE + 30_000).compact_label).toBe("59m");
    expect(at(9 * MINUTE + 59_000).compact_label).toBe("9:59");
    expect(at(4 * MINUTE + 7_000).spoken_label).toBe("4 minutes 7 seconds");
    expect(at(2 * MINUTE).spoken_label).toBe("2 minutes");
    expect(at(1_000).spoken_label).toBe("1 second");
    // Partial seconds round up, so the label reads 0:00 only once expired.
    expect(at(400).compact_label).toBe("0:01");
  });

  test("the tone turns amber in the last two minutes and red in the last 30 seconds", () => {
    const at = (remaining_ms: number) =>
      describeFlowExpiry({
        now: NOW,
        expires_at: NOW + remaining_ms,
        duration_ms: 15 * MINUTE,
      }).tone;
    expect(at(FLOW_EXPIRY_WARNING_MS + 1)).toBe("default");
    expect(at(FLOW_EXPIRY_WARNING_MS)).toBe("warning");
    expect(at(FLOW_EXPIRY_CRITICAL_MS + 1)).toBe("warning");
    expect(at(FLOW_EXPIRY_CRITICAL_MS)).toBe("destructive");
  });

  test("a short flow turns amber once a third of it is left", () => {
    // A 5-minute MFA challenge: a third is 100 seconds, under two minutes.
    const at = (remaining_ms: number) =>
      describeFlowExpiry({
        now: NOW,
        expires_at: NOW + remaining_ms,
        duration_ms: 5 * MINUTE,
      }).tone;
    expect(at(101_000)).toBe("default");
    expect(at(100_000)).toBe("warning");
  });

  test("an expired flow is empty and red", () => {
    const expiry = describeFlowExpiry({
      now: NOW,
      expires_at: NOW - 5_000,
      duration_ms: 15 * MINUTE,
    });
    expect(expiry.remaining_ms).toBe(0);
    expect(expiry.fraction).toBe(0);
    expect(expiry.expired).toBe(true);
    expect(expiry.tone).toBe("destructive");
    expect(expiry.compact_label).toBe("0:00");
    expect(expiry.spoken_label).toBe("no time");
  });
});
