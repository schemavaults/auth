import { describe, expect, test } from "bun:test";
import {
  buildDurationHistogram,
  buildTimeSeries,
  countByCategory,
  niceStep,
  niceTicks,
  percentile,
  summarizeDurations,
  summarizeOperations,
  summarizeTraces,
  timeTicks,
  type DurationBucket,
  type TraceSample,
} from "./trace-analytics";

function trace(
  op_name: string,
  start_time: number,
  duration: number,
  op_category: string = "subroutine",
): TraceSample {
  return {
    event_id: `${op_name}-${start_time}`,
    op_name,
    op_category,
    start_time,
    end_time: start_time + duration,
  };
}

function totalCount(buckets: readonly DurationBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

describe("percentile", () => {
  test("interpolates between the closest ranks like percentile_cont", () => {
    const sorted = [10, 20, 30, 40];
    expect(percentile(sorted, 0)).toBe(10);
    expect(percentile(sorted, 1)).toBe(40);
    expect(percentile(sorted, 0.5)).toBe(25);
    expect(percentile(sorted, 0.9)).toBeCloseTo(37, 10);
  });

  test("is NaN for an empty sample and the value itself for one value", () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([7], 0.95)).toBe(7);
  });
});

describe("summarizeDurations", () => {
  test("computes count, total, extremes, mean and percentiles regardless of input order", () => {
    const stats = summarizeDurations([5, 1, 3, 2, 4]);
    expect(stats.count).toBe(5);
    expect(stats.total).toBe(15);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.mean).toBe(3);
    expect(stats.p50).toBe(3);
    expect(stats.p95).toBeCloseTo(4.8, 10);
  });

  test("reports NaN statistics for an empty sample", () => {
    const stats = summarizeDurations([]);
    expect(stats.count).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.mean).toBeNaN();
    expect(stats.max).toBeNaN();
  });
});

describe("summarizeTraces", () => {
  test("counts distinct operations and categories and derives the throughput", () => {
    const summary = summarizeTraces([
      trace("GET /apps (preload data)", 60_000, 10),
      trace("POST /api/auth/login", 0, 200),
      trace("POST /api/auth/login", 120_000, 300, "database_query"),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.operations).toBe(2);
    expect(summary.categories).toBe(2);
    expect(summary.first_start).toBe(0);
    expect(summary.last_start).toBe(120_000);
    expect(summary.span_ms).toBe(120_000);
    expect(summary.per_minute).toBe(1.5);
  });

  test("has no throughput when every trace started at the same instant", () => {
    const summary = summarizeTraces([trace("a", 5, 1), trace("b", 5, 2)]);
    expect(summary.span_ms).toBe(0);
    expect(summary.per_minute).toBeNull();
  });

  test("clamps a trace that ended before it started to a zero duration", () => {
    const summary = summarizeTraces([{ ...trace("a", 100, 0), end_time: 90 }]);
    expect(summary.max).toBe(0);
  });
});

describe("summarizeOperations", () => {
  test("groups by operation, busiest first, with shares of the sample", () => {
    const operations = summarizeOperations([
      trace("login", 0, 100),
      trace("login", 10, 300),
      trace("login", 20, 200),
      trace("preload", 5, 10),
    ]);
    expect(operations.map((op) => op.op_name)).toEqual(["login", "preload"]);
    const [login, preload] = operations;
    expect(login!.count).toBe(3);
    expect(login!.p50).toBe(200);
    expect(login!.max).toBe(300);
    expect(login!.share).toBe(0.75);
    expect(login!.last_seen).toBe(20);
    expect(preload!.share).toBe(0.25);
  });

  test("keeps the same name in two categories as two rows", () => {
    const operations = summarizeOperations([
      trace("shared", 0, 1, "subroutine"),
      trace("shared", 1, 1, "database_query"),
    ]);
    expect(operations).toHaveLength(2);
  });
});

describe("countByCategory", () => {
  test("lists every known category, then unknown ones busiest first", () => {
    const counts = countByCategory(
      [trace("a", 0, 1, "subroutine"), trace("b", 0, 1, "legacy"), trace("c", 0, 1, "legacy")],
      ["subroutine", "database_query"],
    );
    expect(counts).toEqual([
      { op_category: "subroutine", count: 1 },
      { op_category: "database_query", count: 0 },
      { op_category: "legacy", count: 2 },
    ]);
  });
});

describe("niceStep / niceTicks", () => {
  test("rounds steps up to 1, 2 or 5 × 10^k", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(130)).toBe(200);
    expect(niceStep(0.3, 1)).toBe(1);
  });

  test("produces clean ticks within the domain", () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 50, 100]);
    expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceTicks(3, 3)).toEqual([3]);
  });
});

describe("buildDurationHistogram", () => {
  test("is empty for no durations", () => {
    expect(buildDurationHistogram([], "linear")).toEqual([]);
    expect(buildDurationHistogram([], "log")).toEqual([]);
  });

  test("bins linearly with nice widths and keeps every duration", () => {
    const durations = Array.from({ length: 100 }, (_, i) => 100 + i);
    const buckets = buildDurationHistogram(durations, "linear");
    expect(totalCount(buckets)).toBe(100);
    const widths = new Set(buckets.map((b) => (b.upper ?? 0) - b.lower));
    expect(widths.size).toBe(1);
    expect(buckets[0]!.lower).toBeLessThanOrEqual(100);
    expect(buckets.at(-1)!.upper!).toBeGreaterThan(199);
  });

  test("puts identical durations in a single 1 ms bin", () => {
    expect(buildDurationHistogram([5, 5, 5], "linear")).toEqual([
      { lower: 5, upper: 6, count: 3 },
    ]);
  });

  test("folds a long tail past the p95 into an open-ended overflow bucket", () => {
    // 96 fast traces and a burst of 4 slow ones.
    const durations = [...Array.from({ length: 96 }, (_, i) => i % 50), 3_000, 3_500, 3_900, 10_000];
    const buckets = buildDurationHistogram(durations, "linear");
    const overflow = buckets.at(-1)!;
    expect(overflow.upper).toBeNull();
    expect(overflow.count).toBe(4);
    expect(totalCount(buckets)).toBe(100);
    // The bulk still gets fine bins instead of one bin squashed by the outlier.
    expect(buckets.length).toBeGreaterThan(5);
  });

  test("bins logarithmically on the 1-2-5 series and trims empty edges", () => {
    const buckets = buildDurationHistogram([3, 4, 60, 1500], "log");
    expect(buckets.map((b) => [b.lower, b.upper, b.count])).toEqual([
      [2, 5, 2],
      [5, 10, 0],
      [10, 20, 0],
      [20, 50, 0],
      [50, 100, 1],
      [100, 200, 0],
      [200, 500, 0],
      [500, 1000, 0],
      [1000, 2000, 1],
    ]);
  });

  test("puts sub-millisecond (zero) durations in the first log bucket", () => {
    expect(buildDurationHistogram([0, 0], "log")).toEqual([
      { lower: 0, upper: 1, count: 2 },
    ]);
  });
});

describe("timeTicks", () => {
  test("lands on round multiples of a nice width inside the window", () => {
    expect(timeTicks(61_000, 185_000, 4)).toEqual([120_000, 180_000]);
    expect(timeTicks(0, 3_600_000, 4)).toEqual([0, 900_000, 1_800_000, 2_700_000, 3_600_000]);
  });

  test("degrades to the single instant of an empty window", () => {
    expect(timeTicks(5, 5)).toEqual([5]);
  });
});

describe("buildTimeSeries", () => {
  test("picks the smallest nice bucket width that fits the target count", () => {
    const series = buildTimeSeries([], { from: 0, to: 3_600_000 }, 36);
    expect(series.bucket_ms).toBe(2 * 60_000);
    expect(series.buckets).toHaveLength(31);
  });

  test("aligns buckets to the width and assigns traces by start time", () => {
    const series = buildTimeSeries(
      [trace("a", 61_000, 10), trace("a", 62_000, 30), trace("a", 125_000, 5)],
      { from: 61_000, to: 125_000 },
      10,
    );
    expect(series.bucket_ms).toBe(10_000);
    expect(series.buckets[0]!.start).toBe(60_000);
    expect(series.buckets[0]!.count).toBe(2);
    expect(series.buckets[0]!.p50).toBe(20);
    expect(series.buckets[0]!.max).toBe(30);
    expect(series.buckets[1]!.count).toBe(0);
    expect(series.buckets[1]!.p95).toBeNaN();
    expect(series.buckets.at(-1)!.count).toBe(1);
    expect(series.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3);
  });

  test("ignores traces outside the window", () => {
    const series = buildTimeSeries([trace("a", 5_000_000, 1)], { from: 0, to: 60_000 });
    expect(series.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});
