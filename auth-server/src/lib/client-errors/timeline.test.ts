import { describe, expect, test } from "bun:test";
import {
  chooseTimelineBucketMs,
  fillTimeline,
  MAX_CLIENT_ERROR_TIMELINE_BUCKETS,
} from "./timeline";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("chooseTimelineBucketMs", () => {
  test("picks the narrowest width within the bucket budget", () => {
    expect(chooseTimelineBucketMs(0)).toBe(HOUR);
    expect(chooseTimelineBucketMs(DAY)).toBe(HOUR);
    expect(chooseTimelineBucketMs(7 * DAY)).toBe(3 * HOUR);
    expect(chooseTimelineBucketMs(30 * DAY)).toBe(12 * HOUR);
    expect(chooseTimelineBucketMs(90 * DAY)).toBe(DAY);
    expect(chooseTimelineBucketMs(365 * DAY)).toBe(7 * DAY);
  });

  test("never exceeds the budget for the widest width it can", () => {
    for (const span of [DAY, 7 * DAY, 30 * DAY, 90 * DAY, 365 * DAY, 5 * 365 * DAY]) {
      expect(Math.ceil(span / chooseTimelineBucketMs(span))).toBeLessThanOrEqual(
        MAX_CLIENT_ERROR_TIMELINE_BUCKETS,
      );
    }
  });
});

describe("fillTimeline", () => {
  test("emits every bucket of the window, zero where nothing was counted", () => {
    const from = 10 * HOUR + 15 * 60 * 1000;
    const to = 13 * HOUR + 1;
    const buckets = fillTimeline(from, to, HOUR, new Map([[11 * HOUR, 4]]));
    expect(buckets).toEqual([
      { start: 10 * HOUR, count: 0 },
      { start: 11 * HOUR, count: 4 },
      { start: 12 * HOUR, count: 0 },
      { start: 13 * HOUR, count: 0 },
    ]);
  });
});
