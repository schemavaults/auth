/**
 * Pure statistics over a sample of server traces, shared by every tile of
 * the `/admin/traces` dashboard so their numbers agree. Durations are in
 * whole milliseconds (`end_time - start_time`).
 */

export interface TraceSample {
  event_id: string;
  op_name: string;
  op_category: string;
  start_time: number;
  end_time: number;
}

export function traceDurationMs(trace: TraceSample): number {
  return Math.max(0, trace.end_time - trace.start_time);
}

/**
 * Percentile `p` (0–1) of ascending-sorted values, interpolating linearly
 * between the closest ranks (Postgres `percentile_cont`). `NaN` when empty.
 */
export function percentile(sorted: readonly number[], p: number): number {
  const count: number = sorted.length;
  if (count === 0) {
    return NaN;
  }
  const clamped: number = Math.min(1, Math.max(0, p));
  const rank: number = clamped * (count - 1);
  const lower: number = Math.floor(rank);
  const upper: number = Math.ceil(rank);
  const lower_value: number = sorted[lower]!;
  const upper_value: number = sorted[upper]!;
  return lower_value + (upper_value - lower_value) * (rank - lower);
}

export interface DurationStats {
  count: number;
  /** Sum of every duration. */
  total: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

function ascending(a: number, b: number): number {
  return a - b;
}

/** Summary statistics of `durations`; every statistic but `count`/`total` is `NaN` when empty. */
export function summarizeDurations(durations: readonly number[]): DurationStats {
  const sorted: number[] = [...durations].sort(ascending);
  const count: number = sorted.length;
  const total: number = sorted.reduce(
    (sum: number, value: number): number => sum + value,
    0,
  );
  return {
    count,
    total,
    min: count > 0 ? sorted[0]! : NaN,
    max: count > 0 ? sorted[count - 1]! : NaN,
    mean: count > 0 ? total / count : NaN,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

export interface TraceSummary extends DurationStats {
  /** Distinct operation names in the sample. */
  operations: number;
  /** Distinct categories in the sample. */
  categories: number;
  /** Start of the oldest trace (Unix epoch ms), `null` when empty. */
  first_start: number | null;
  /** Start of the newest trace (Unix epoch ms), `null` when empty. */
  last_start: number | null;
  /** Time between the oldest and newest trace starts. */
  span_ms: number;
  /** Traces per minute across the span, `null` when the span is empty. */
  per_minute: number | null;
}

export function summarizeTraces(traces: readonly TraceSample[]): TraceSummary {
  const stats: DurationStats = summarizeDurations(traces.map(traceDurationMs));
  let first_start: number | null = null;
  let last_start: number | null = null;
  const operations = new Set<string>();
  const categories = new Set<string>();
  for (const trace of traces) {
    operations.add(trace.op_name);
    categories.add(trace.op_category);
    if (first_start === null || trace.start_time < first_start) {
      first_start = trace.start_time;
    }
    if (last_start === null || trace.start_time > last_start) {
      last_start = trace.start_time;
    }
  }
  const span_ms: number =
    first_start !== null && last_start !== null ? last_start - first_start : 0;
  return {
    ...stats,
    operations: operations.size,
    categories: categories.size,
    first_start,
    last_start,
    span_ms,
    per_minute: span_ms > 0 ? (stats.count / span_ms) * 60_000 : null,
  };
}

export interface OperationStats extends DurationStats {
  op_name: string;
  op_category: string;
  /** Share of the sample's traces (0–1). */
  share: number;
  /** Start of the operation's newest trace (Unix epoch ms). */
  last_seen: number;
}

/** Per-operation statistics, busiest operation first. */
export function summarizeOperations(
  traces: readonly TraceSample[],
): OperationStats[] {
  const groups = new Map<
    string,
    { op_name: string; op_category: string; durations: number[]; last_seen: number }
  >();
  for (const trace of traces) {
    // Operation names are unique per category in practice; keying on both
    // keeps a (mis)reused name in two categories as two rows.
    const key: string = `${trace.op_category}\u0000${trace.op_name}`;
    const group = groups.get(key);
    if (group) {
      group.durations.push(traceDurationMs(trace));
      group.last_seen = Math.max(group.last_seen, trace.start_time);
    } else {
      groups.set(key, {
        op_name: trace.op_name,
        op_category: trace.op_category,
        durations: [traceDurationMs(trace)],
        last_seen: trace.start_time,
      });
    }
  }
  const total: number = traces.length;
  return Array.from(groups.values())
    .map(
      (group): OperationStats => ({
        ...summarizeDurations(group.durations),
        op_name: group.op_name,
        op_category: group.op_category,
        share: total > 0 ? group.durations.length / total : 0,
        last_seen: group.last_seen,
      }),
    )
    .sort(
      (a: OperationStats, b: OperationStats): number =>
        b.count - a.count || a.op_name.localeCompare(b.op_name),
    );
}

export interface CategoryCount {
  op_category: string;
  count: number;
}

/** Trace count per category, in the order of `categories` (unlisted categories follow, busiest first). */
export function countByCategory(
  traces: readonly TraceSample[],
  categories: readonly string[],
): CategoryCount[] {
  const counts = new Map<string, number>(
    categories.map((category: string): [string, number] => [category, 0]),
  );
  for (const trace of traces) {
    counts.set(trace.op_category, (counts.get(trace.op_category) ?? 0) + 1);
  }
  const known: CategoryCount[] = categories.map(
    (op_category: string): CategoryCount => ({
      op_category,
      count: counts.get(op_category) ?? 0,
    }),
  );
  const unknown: CategoryCount[] = Array.from(counts.entries())
    .filter(([op_category]): boolean => !categories.includes(op_category))
    .map(([op_category, count]): CategoryCount => ({ op_category, count }))
    .sort((a: CategoryCount, b: CategoryCount): number => b.count - a.count);
  return [...known, ...unknown];
}

/**
 * The smallest "nice" step (1, 2 or 5 × 10^k) that is at least `raw_step`;
 * never below `min_step`.
 */
export function niceStep(raw_step: number, min_step: number = 0): number {
  if (!Number.isFinite(raw_step) || raw_step <= 0) {
    return Math.max(min_step, 1);
  }
  const magnitude: number = 10 ** Math.floor(Math.log10(raw_step));
  const residual: number = raw_step / magnitude;
  const nice: number =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return Math.max(min_step, nice * magnitude);
}

/**
 * Top of a zero-based value axis: the first "nice" tick at or above `max`
 * when the axis is split into about `target` intervals of at least
 * `min_step` (1 for whole counts and milliseconds).
 */
export function niceAxisTop(
  max: number,
  target: number = 4,
  min_step: number = 1,
): number {
  const clamped: number = Number.isFinite(max) ? Math.max(0, max) : 0;
  const step: number = niceStep(clamped / Math.max(1, target), min_step);
  return Math.max(step, Math.ceil(clamped / step) * step);
}

/** Candidate time-bucket widths, smallest first. */
const TIME_BUCKET_WIDTHS_MS: readonly number[] = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 2 * 3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000, 2 * 86_400_000, 7 * 86_400_000,
];

/**
 * Time-axis ticks at multiples of the smallest nice width that yields at
 * most `target` intervals over [from, to].
 */
export function timeTicks(from: number, to: number, target: number = 4): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return Number.isFinite(from) ? [from] : [];
  }
  const span: number = to - from;
  const width: number =
    TIME_BUCKET_WIDTHS_MS.find(
      (candidate: number): boolean => span / candidate <= target,
    ) ?? niceStep(span / target);
  const ticks: number[] = [];
  for (let tick = Math.ceil(from / width) * width; tick <= to; tick += width) {
    ticks.push(tick);
  }
  return ticks;
}

export interface TimeBucket {
  /** Inclusive bucket start (Unix epoch ms). */
  start: number;
  /** Exclusive bucket end (Unix epoch ms). */
  end: number;
  count: number;
  /** Duration percentiles of the bucket's traces; `NaN` when the bucket is empty. */
  p50: number;
  p95: number;
  max: number;
}

export interface TimeSeries {
  bucket_ms: number;
  buckets: TimeBucket[];
}

/**
 * Buckets traces by start time over [from, to] with the smallest nice width
 * that yields at most `target` buckets. Buckets align to multiples of the
 * width (UTC), so the same window always buckets the same way.
 */
export function buildTimeSeries(
  traces: readonly TraceSample[],
  time_window: { from: number; to: number },
  target: number = 36,
): TimeSeries {
  const from: number = Math.min(time_window.from, time_window.to);
  const to: number = Math.max(time_window.from, time_window.to);
  const span: number = Math.max(1, to - from);
  const bucket_ms: number =
    TIME_BUCKET_WIDTHS_MS.find(
      (width: number): boolean => span / width <= target,
    ) ?? Math.ceil(span / target);
  const first_start: number = Math.floor(from / bucket_ms) * bucket_ms;
  const bucket_count: number = Math.floor((to - first_start) / bucket_ms) + 1;

  const durations: number[][] = Array.from(
    { length: bucket_count },
    (): number[] => [],
  );
  for (const trace of traces) {
    const index: number = Math.floor((trace.start_time - first_start) / bucket_ms);
    if (index >= 0 && index < bucket_count) {
      durations[index]!.push(traceDurationMs(trace));
    }
  }

  return {
    bucket_ms,
    buckets: durations.map((values: number[], index: number): TimeBucket => {
      const sorted: number[] = values.sort(ascending);
      const start: number = first_start + index * bucket_ms;
      return {
        start,
        end: start + bucket_ms,
        count: sorted.length,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: sorted.length > 0 ? sorted[sorted.length - 1]! : NaN,
      };
    }),
  };
}
