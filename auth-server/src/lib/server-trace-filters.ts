import {
  serverTraceOpCategories,
  type ServerTraceOpCategory,
} from "@/lib/server-trace-schema";

/**
 * Filters of the `/admin/traces` dashboard, shared by the page (URL search
 * params, SSR preload) and its client (API query strings). Isomorphic: no
 * server-only imports.
 */

export const SERVER_TRACE_RANGE_IDS = [
  "15m",
  "1h",
  "6h",
  "24h",
  "7d",
  "30d",
  "all",
] as const;

export type ServerTraceRangeId = (typeof SERVER_TRACE_RANGE_IDS)[number];

export const SERVER_TRACE_RANGE_LABELS: Record<ServerTraceRangeId, string> = {
  "15m": "Last 15 minutes",
  "1h": "Last hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const MINUTE_MS: number = 60_000;
const HOUR_MS: number = 60 * MINUTE_MS;
const DAY_MS: number = 24 * HOUR_MS;

const SERVER_TRACE_RANGE_DURATIONS_MS: Record<
  Exclude<ServerTraceRangeId, "all">,
  number
> = {
  "15m": 15 * MINUTE_MS,
  "1h": HOUR_MS,
  "6h": 6 * HOUR_MS,
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export function isServerTraceRangeId(
  value: unknown,
): value is ServerTraceRangeId {
  return (
    typeof value === "string" &&
    (SERVER_TRACE_RANGE_IDS as readonly string[]).includes(value)
  );
}

/** Start of the range (Unix epoch ms) relative to `now_ms`; `undefined` for all time. */
export function getServerTraceRangeStart(
  range: ServerTraceRangeId,
  now_ms: number,
): number | undefined {
  if (range === "all") {
    return undefined;
  }
  return Math.max(0, now_ms - SERVER_TRACE_RANGE_DURATIONS_MS[range]);
}

/** Largest number of traces `GET /api/admin/server-traces` returns in one response. */
export const SERVER_TRACES_MAX_LIMIT: number = 5000;

/** Number of traces `GET /api/admin/server-traces` returns when the caller names no `limit`. */
export const SERVER_TRACES_DEFAULT_LIMIT: number = 200;

/** Sample sizes offered by the dashboard (the N most recent matching traces). */
export const SERVER_TRACE_SAMPLE_SIZES = [200, 1000, 5000] as const;

export type ServerTraceSampleSize = (typeof SERVER_TRACE_SAMPLE_SIZES)[number];

export function isServerTraceSampleSize(
  value: unknown,
): value is ServerTraceSampleSize {
  return (
    typeof value === "number" &&
    (SERVER_TRACE_SAMPLE_SIZES as readonly number[]).includes(value)
  );
}

export function isServerTraceOpCategory(
  value: unknown,
): value is ServerTraceOpCategory {
  return (
    typeof value === "string" &&
    (serverTraceOpCategories as readonly string[]).includes(value)
  );
}

export interface ServerTraceFilters {
  range: ServerTraceRangeId;
  /** Operation names to keep; empty keeps every operation. */
  op_names: readonly string[];
  /** Categories to keep; empty keeps every category. */
  op_categories: readonly ServerTraceOpCategory[];
  /** How many of the most recent matching traces to load. */
  limit: ServerTraceSampleSize;
}

export const DEFAULT_SERVER_TRACE_FILTERS: ServerTraceFilters = {
  range: "all",
  op_names: [],
  op_categories: [],
  limit: 1000,
};

/** Search param names of the dashboard page URL. */
const PAGE_PARAM = {
  range: "range",
  op_name: "op",
  op_category: "category",
  limit: "limit",
} as const;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

function readAll(
  params: URLSearchParams | SearchParamsRecord,
  key: string,
): string[] {
  if (params instanceof URLSearchParams) {
    return params.getAll(key);
  }
  const value: string | string[] | undefined = params[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Reads the dashboard filters from the page URL. Unknown or malformed values
 * fall back to the defaults instead of failing, so a stale bookmark still
 * opens the page.
 */
export function parseServerTraceFilters(
  params: URLSearchParams | SearchParamsRecord,
): ServerTraceFilters {
  const [range] = readAll(params, PAGE_PARAM.range);
  const [limit] = readAll(params, PAGE_PARAM.limit);
  const parsed_limit: number = limit === undefined ? NaN : Number(limit);

  return {
    range: isServerTraceRangeId(range)
      ? range
      : DEFAULT_SERVER_TRACE_FILTERS.range,
    op_names: unique(
      readAll(params, PAGE_PARAM.op_name).filter(
        (op_name: string): boolean => op_name.length > 0,
      ),
    ),
    op_categories: unique(
      readAll(params, PAGE_PARAM.op_category).filter(isServerTraceOpCategory),
    ),
    limit: isServerTraceSampleSize(parsed_limit)
      ? parsed_limit
      : DEFAULT_SERVER_TRACE_FILTERS.limit,
  };
}

/** The page URL search params for `filters`; defaults are left out. */
export function serverTraceFiltersToSearchParams(
  filters: ServerTraceFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_SERVER_TRACE_FILTERS.range) {
    params.set(PAGE_PARAM.range, filters.range);
  }
  for (const op_category of filters.op_categories) {
    params.append(PAGE_PARAM.op_category, op_category);
  }
  for (const op_name of filters.op_names) {
    params.append(PAGE_PARAM.op_name, op_name);
  }
  if (filters.limit !== DEFAULT_SERVER_TRACE_FILTERS.limit) {
    params.set(PAGE_PARAM.limit, String(filters.limit));
  }
  return params;
}

/** A stable identity for `filters` (order-insensitive), e.g. for cache keys. */
export function serverTraceFiltersKey(filters: ServerTraceFilters): string {
  return JSON.stringify([
    filters.range,
    [...filters.op_categories].sort(),
    [...filters.op_names].sort(),
    filters.limit,
  ]);
}

/**
 * Query string of `GET /api/admin/server-traces` for `filters`, with the
 * relative time range resolved against `now_ms`.
 */
export function serverTraceListQuery(
  filters: ServerTraceFilters,
  now_ms: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit));
  const since: number | undefined = getServerTraceRangeStart(
    filters.range,
    now_ms,
  );
  if (since !== undefined) {
    params.set("since", String(since));
  }
  for (const op_category of filters.op_categories) {
    params.append("op_category", op_category);
  }
  for (const op_name of filters.op_names) {
    params.append("op_name", op_name);
  }
  return params;
}

/**
 * Query string of `GET /api/admin/server-traces/operations` for the time
 * range of `filters` (the operation and category filters are left out so
 * every operation stays selectable).
 */
export function serverTraceOperationsQuery(
  filters: Pick<ServerTraceFilters, "range">,
  now_ms: number,
): URLSearchParams {
  const params = new URLSearchParams();
  const since: number | undefined = getServerTraceRangeStart(
    filters.range,
    now_ms,
  );
  if (since !== undefined) {
    params.set("since", String(since));
  }
  return params;
}
