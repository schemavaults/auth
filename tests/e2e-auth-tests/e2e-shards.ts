// e2e-shards.ts
//
// Splits one E2E suite's spec files into shards of roughly equal duration,
// so CI can run a long suite on several runners at once (`e2e <suite>
// --shard <index>/<total>`). Every runner computes the same plan from the
// same spec list and duration table, and picks its own shard.

export interface ShardSelector {
  /** 1-based index of the shard to run. */
  index: number;
  total: number;
}

export interface Shard {
  /** Spec file names (relative to the suite folder), sorted by name. */
  specs: string[];
  estimated_seconds: number;
}

/** Spec duration estimate for a suite without recorded durations. */
const FALLBACK_SPEC_SECONDS = 60;

/** Parses `<index>/<total>`, e.g. `2/4`. */
export function parseShardSelector(value: string): ShardSelector {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid shard '${value}': expected '<index>/<total>', e.g. '2/4'`,
    );
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1 || index < 1 || index > total) {
    throw new Error(
      `Invalid shard '${value}': the index must be between 1 and the total`,
    );
  }
  return { index, total };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Assigns each spec to one of `total` shards, longest spec first, always to
 * the shard with the least estimated work so far (ties: lowest index). Specs
 * without a recorded duration are estimated at the suite's median, so new
 * specs need no entry in the table. Deterministic for a given input.
 */
export function planShards(
  specs: readonly string[],
  recorded_seconds: Readonly<Record<string, number>>,
  total: number,
): Shard[] {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`Invalid shard total ${total}`);
  }
  const known = specs
    .map((spec) => recorded_seconds[spec])
    .filter((seconds): seconds is number => typeof seconds === "number");
  const default_seconds =
    known.length > 0 ? median(known) : FALLBACK_SPEC_SECONDS;
  const estimate = (spec: string): number =>
    recorded_seconds[spec] ?? default_seconds;

  const shards: Shard[] = Array.from({ length: total }, () => ({
    specs: [],
    estimated_seconds: 0,
  }));
  const longest_first = [...specs].sort(
    (a, b) => estimate(b) - estimate(a) || a.localeCompare(b),
  );
  for (const spec of longest_first) {
    let target = shards[0];
    for (const shard of shards) {
      if (shard.estimated_seconds < target.estimated_seconds) target = shard;
    }
    target.specs.push(spec);
    target.estimated_seconds += estimate(spec);
  }
  for (const shard of shards) shard.specs.sort((a, b) => a.localeCompare(b));

  // A spec missing from every shard would silently never run in CI.
  const assigned = shards.flatMap((shard) => shard.specs);
  if (
    assigned.length !== specs.length ||
    specs.some((spec) => !assigned.includes(spec))
  ) {
    throw new Error("Shard plan does not cover every spec exactly once");
  }
  return shards;
}
