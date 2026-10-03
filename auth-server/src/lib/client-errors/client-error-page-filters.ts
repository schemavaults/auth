import { appIdSchema } from "@schemavaults/app-definitions";

/**
 * Filters of the `/admin/client-errors` dashboard, kept in the page URL so a
 * view can be bookmarked and shared. Isomorphic: no server-only imports.
 */

export const CLIENT_ERROR_RANGE_IDS = ["24h", "7d", "30d", "90d", "all"] as const;

export type ClientErrorRangeId = (typeof CLIENT_ERROR_RANGE_IDS)[number];

export const CLIENT_ERROR_RANGE_LABELS: Record<ClientErrorRangeId, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

const DAY_MS: number = 24 * 60 * 60 * 1000;

const CLIENT_ERROR_RANGE_DURATIONS_MS: Record<Exclude<ClientErrorRangeId, "all">, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export function isClientErrorRangeId(value: unknown): value is ClientErrorRangeId {
  return typeof value === "string" && (CLIENT_ERROR_RANGE_IDS as readonly string[]).includes(value);
}

/** Start of the range (Unix epoch ms) relative to `now_ms`; `undefined` for all time. */
export function getClientErrorRangeStart(range: ClientErrorRangeId, now_ms: number): number | undefined {
  if (range === "all") return undefined;
  return Math.max(0, now_ms - CLIENT_ERROR_RANGE_DURATIONS_MS[range]);
}

/** Rows per page of the dashboard's error list. */
export const CLIENT_ERRORS_PAGE_SIZE: number = 50;

/** Largest page `GET /api/admin/client-errors` returns. */
export const CLIENT_ERRORS_MAX_LIMIT: number = 500;

/** Page size of `GET /api/admin/client-errors` when the caller names no `limit`. */
export const CLIENT_ERRORS_DEFAULT_LIMIT: number = 50;

/** Longest free-text search the dashboard and the API accept. */
export const CLIENT_ERROR_SEARCH_MAX_LENGTH: number = 200;

export interface ClientErrorPageFilters {
  range: ClientErrorRangeId;
  client_app_id: string | null;
  fingerprint: string | null;
  q: string | null;
  /** 1-based page of the error list. */
  page: number;
}

export const DEFAULT_CLIENT_ERROR_PAGE_FILTERS: ClientErrorPageFilters = {
  range: "7d",
  client_app_id: null,
  fingerprint: null,
  q: null,
  page: 1,
};

const FINGERPRINT_REGEX: RegExp = /^[0-9a-f]{32}$/;

type SearchParamsLike =
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

function firstParam(params: SearchParamsLike, name: string): string | undefined {
  const value: string | readonly string[] | null | undefined =
    params instanceof URLSearchParams ? params.get(name) : params[name];
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? value : value[0];
}

/** The dashboard filters in a page URL's search params; invalid values fall back to the defaults. */
export function parseClientErrorPageFilters(params: SearchParamsLike): ClientErrorPageFilters {
  const range: string | undefined = firstParam(params, "range");
  const app: string | undefined = firstParam(params, "app");
  const fingerprint: string | undefined = firstParam(params, "group");
  const q: string | undefined = firstParam(params, "q")?.trim();
  const page: number = Number.parseInt(firstParam(params, "page") ?? "", 10);

  return {
    range: isClientErrorRangeId(range) ? range : DEFAULT_CLIENT_ERROR_PAGE_FILTERS.range,
    client_app_id: app && appIdSchema.safeParse(app).success ? app : null,
    fingerprint: fingerprint && FINGERPRINT_REGEX.test(fingerprint) ? fingerprint : null,
    q: q ? q.slice(0, CLIENT_ERROR_SEARCH_MAX_LENGTH) : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The search params of a page URL showing `filters`; defaults are left out. */
export function clientErrorPageFiltersToSearchParams(filters: ClientErrorPageFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_CLIENT_ERROR_PAGE_FILTERS.range) params.set("range", filters.range);
  if (filters.client_app_id) params.set("app", filters.client_app_id);
  if (filters.fingerprint) params.set("group", filters.fingerprint);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}
