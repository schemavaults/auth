import type { UserData } from "@schemavaults/auth-common";

const DAY_MS: number = 24 * 60 * 60 * 1000;

/**
 * Buckets are aligned to UTC midnight rather than the viewer's midnight so
 * that the series rendered on the server (from the SSR-preloaded users)
 * matches the series the browser computes while hydrating. UTC days are also
 * always exactly `DAY_MS` long, which local days are not across a DST
 * transition.
 */
export function startOfUtcDay(timestamp_ms: number): number {
  return Math.floor(timestamp_ms / DAY_MS) * DAY_MS;
}

/** Formats a UTC timestamp as `YYYY/MM/DD`, matching `printDateTime`. */
export function formatUtcDay(timestamp_ms: number): string {
  const date = new Date(timestamp_ms);
  const month: string = `0${date.getUTCMonth() + 1}`.slice(-2);
  const day_of_month: string = `0${date.getUTCDate()}`.slice(-2);
  return `${date.getUTCFullYear()}/${month}/${day_of_month}`;
}

/** Formats a UTC timestamp as `MM/DD`, for compact chart axis labels. */
export function formatUtcDayShort(timestamp_ms: number): string {
  const date = new Date(timestamp_ms);
  const month: string = `0${date.getUTCMonth() + 1}`.slice(-2);
  const day_of_month: string = `0${date.getUTCDate()}`.slice(-2);
  return `${month}/${day_of_month}`;
}

export const USER_CATEGORY_IDS = ["normal", "admin", "disabled"] as const;

export type UserCategoryId = (typeof USER_CATEGORY_IDS)[number];

export interface UserBreakdown {
  /** Every registered account. */
  total: number;
  /** Enabled accounts without the admin flag. */
  normal: number;
  /** Enabled accounts with the admin flag. */
  admin: number;
  /** Accounts blocked from signing in, admin or not. */
  disabled: number;
}

/**
 * @description Assigns every user to exactly one category so the three
 * counts always sum to `total` and can be drawn as a pie chart. Being
 * disabled wins over being an admin: a disabled administrator is counted
 * once, under `disabled`, because the account cannot sign in either way.
 *
 * Note that this deliberately differs from the "Admins" / "Disabled" stat
 * cards, which count the `admin` and `disabled` flags independently.
 */
export function summarizeUserBreakdown(
  users: readonly UserData[],
): UserBreakdown {
  let normal: number = 0;
  let admin: number = 0;
  let disabled: number = 0;

  for (const user of users) {
    if (user.disabled) {
      disabled += 1;
    } else if (user.admin) {
      admin += 1;
    } else {
      normal += 1;
    }
  }

  return { total: users.length, normal, admin, disabled };
}

export const USER_GROWTH_RANGE_IDS = ["7d", "30d", "90d", "all"] as const;

export type UserGrowthRangeId = (typeof USER_GROWTH_RANGE_IDS)[number];

export function isUserGrowthRangeId(
  value: unknown,
): value is UserGrowthRangeId {
  return (
    typeof value === "string" &&
    (USER_GROWTH_RANGE_IDS as readonly string[]).includes(value)
  );
}

/** Trailing-window length in days, or `null` for "since the first sign-up". */
const RANGE_TO_DAYS: Record<UserGrowthRangeId, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const USER_GROWTH_RANGE_LABELS: Record<UserGrowthRangeId, string> = {
  "7d": "7d",
  "30d": "30d",
  "90d": "90d",
  all: "All",
};

/**
 * Upper bound on the number of buckets drawn for the "all" range; the bucket
 * width grows in whole days until the series fits.
 */
const MAX_ALL_RANGE_BUCKETS: number = 60;

export interface UserGrowthBucket {
  /** Inclusive start of the bucket, ms since the epoch. */
  start: number;
  /** Exclusive end of the bucket, ms since the epoch. */
  end: number;
  /** Accounts created within the bucket. */
  signups: number;
  /** Every account that existed by `end`, including those created earlier. */
  cumulative: number;
}

export interface UserGrowthSeries {
  buckets: readonly UserGrowthBucket[];
  /** Width of each bucket in whole days. */
  bucket_days: number;
  /** Accounts created anywhere in the window. */
  signups: number;
  /**
   * Accounts created in the equally long window immediately before this one,
   * or `null` when there is no such window to compare against (the "all"
   * range, which already starts at the very first sign-up).
   */
  previous_signups: number | null;
  /** The busiest bucket — the most recent one when several tie. */
  peak: UserGrowthBucket | null;
  /** Every registered account, i.e. the cumulative total today. */
  total: number;
}

export interface BuildUserGrowthSeriesOptions {
  /** Overrides "now"; defaults to `Date.now()`. */
  now?: number;
}

/**
 * @description Buckets sign-ups into a daily (or, for wide ranges, multi-day)
 * series so the sparklines can show both sign-up spikes and cumulative
 * growth. `users` may be in any order.
 */
export function buildUserGrowthSeries(
  users: readonly UserData[],
  range: UserGrowthRangeId,
  { now = Date.now() }: BuildUserGrowthSeriesOptions = {},
): UserGrowthSeries {
  const total: number = users.length;
  const today_start: number = startOfUtcDay(now);
  // The newest bucket runs to the end of today, so today's sign-ups show up
  // right away instead of at the next UTC midnight.
  const window_end: number = today_start + DAY_MS;

  const created_at_ms: number[] = users
    .map((user: UserData): number => user.created_at)
    .sort((a: number, b: number): number => a - b);

  const range_days: number | null = RANGE_TO_DAYS[range];

  let bucket_days: number;
  let bucket_count: number;
  let window_start: number;

  if (range_days === null) {
    const first_signup: number | undefined = created_at_ms[0];
    if (first_signup === undefined) {
      return {
        buckets: [],
        bucket_days: 1,
        signups: 0,
        previous_signups: null,
        peak: null,
        total,
      };
    }
    const span_days: number = Math.max(
      1,
      Math.round((window_end - startOfUtcDay(first_signup)) / DAY_MS),
    );
    bucket_days = Math.max(1, Math.ceil(span_days / MAX_ALL_RANGE_BUCKETS));
    bucket_count = Math.ceil(span_days / bucket_days);
    // Anchored on the newest bucket so the last one always ends today; the
    // oldest bucket may reach a little further back than the first sign-up.
    window_start = window_end - bucket_count * bucket_days * DAY_MS;
  } else {
    bucket_days = 1;
    bucket_count = range_days;
    window_start = window_end - bucket_count * DAY_MS;
  }

  const bucket_ms: number = bucket_days * DAY_MS;
  const signups_per_bucket: number[] = new Array<number>(bucket_count).fill(0);
  // Accounts that already existed when the window opened; the cumulative
  // series has to start from those rather than from zero.
  let cumulative: number = 0;
  let signups_in_window: number = 0;
  let previous_signups: number = 0;
  const previous_window_start: number = window_start - bucket_count * bucket_ms;

  for (const created_at of created_at_ms) {
    if (created_at < window_start) {
      cumulative += 1;
      if (created_at >= previous_window_start) {
        previous_signups += 1;
      }
      continue;
    }
    if (created_at >= window_end) {
      // Clock skew between the database and this process; count it in the
      // newest bucket rather than dropping it from the chart.
      const last_index: number = bucket_count - 1;
      signups_per_bucket[last_index] = (signups_per_bucket[last_index] ?? 0) + 1;
      signups_in_window += 1;
      continue;
    }
    const index: number = Math.min(
      bucket_count - 1,
      Math.floor((created_at - window_start) / bucket_ms),
    );
    signups_per_bucket[index] = (signups_per_bucket[index] ?? 0) + 1;
    signups_in_window += 1;
  }

  const buckets: UserGrowthBucket[] = [];
  let peak: UserGrowthBucket | null = null;

  for (let index = 0; index < bucket_count; index += 1) {
    const signups: number = signups_per_bucket[index] ?? 0;
    cumulative += signups;
    const bucket: UserGrowthBucket = {
      start: window_start + index * bucket_ms,
      end: window_start + (index + 1) * bucket_ms,
      signups,
      cumulative,
    };
    buckets.push(bucket);
    // `>=` keeps the most recent bucket when several share the highest count,
    // which is the one an administrator is looking for.
    if (signups > 0 && (peak === null || signups >= peak.signups)) {
      peak = bucket;
    }
  }

  return {
    buckets,
    bucket_days,
    signups: signups_in_window,
    previous_signups: range_days === null ? null : previous_signups,
    peak,
    total,
  };
}

export interface UserGrowthTrend {
  direction: "up" | "down" | "neutral";
  /** Whole-percent change against the previous window. */
  percent: number;
  /** `false` when the previous window had no sign-ups to compare against. */
  comparable: boolean;
}

/**
 * @description Compares the window's sign-ups against the equally long
 * window before it. A previous window with no sign-ups has no meaningful
 * percentage, so the change is reported as not comparable.
 */
export function describeUserGrowthTrend(
  series: UserGrowthSeries,
): UserGrowthTrend | null {
  const previous: number | null = series.previous_signups;
  if (previous === null) {
    return null;
  }
  const current: number = series.signups;
  const direction: UserGrowthTrend["direction"] =
    current > previous ? "up" : current < previous ? "down" : "neutral";
  if (previous === 0) {
    return { direction, percent: 0, comparable: false };
  }
  return {
    direction,
    percent: Math.round(((current - previous) / previous) * 100),
    comparable: true,
  };
}
