import { describe, expect, test } from "bun:test";
import {
  type ClientErrorPageFilters,
  clientErrorPageFiltersToSearchParams,
  DEFAULT_CLIENT_ERROR_PAGE_FILTERS,
  getClientErrorRangeStart,
  parseClientErrorPageFilters,
} from "./client-error-page-filters";

const FINGERPRINT = "0123456789abcdef0123456789abcdef";

describe("parseClientErrorPageFilters", () => {
  test("defaults when the URL names no filter", () => {
    expect(parseClientErrorPageFilters(new URLSearchParams())).toEqual(DEFAULT_CLIENT_ERROR_PAGE_FILTERS);
  });

  test("reads every filter, from URLSearchParams or a Next.js searchParams record", () => {
    const expected: ClientErrorPageFilters = {
      range: "30d",
      client_app_id: "my-web-app",
      fingerprint: FINGERPRINT,
      q: "timeout",
      page: 3,
    };
    expect(
      parseClientErrorPageFilters(
        new URLSearchParams({ range: "30d", app: "my-web-app", group: FINGERPRINT, q: " timeout ", page: "3" }),
      ),
    ).toEqual(expected);
    expect(
      parseClientErrorPageFilters({ range: ["30d", "7d"], app: "my-web-app", group: FINGERPRINT, q: "timeout", page: "3" }),
    ).toEqual(expected);
  });

  test("drops invalid values", () => {
    expect(
      parseClientErrorPageFilters(
        new URLSearchParams({ range: "1y", app: "Not An App Id!", group: "xyz", q: "   ", page: "-2" }),
      ),
    ).toEqual(DEFAULT_CLIENT_ERROR_PAGE_FILTERS);
  });
});

describe("clientErrorPageFiltersToSearchParams", () => {
  test("round-trips and leaves defaults out", () => {
    const filters = { range: "all", client_app_id: "my-web-app", fingerprint: FINGERPRINT, q: "boom", page: 2 } as const;
    const params = clientErrorPageFiltersToSearchParams(filters);
    expect(params.toString()).toBe(`range=all&app=my-web-app&group=${FINGERPRINT}&q=boom&page=2`);
    expect(parseClientErrorPageFilters(params)).toEqual(filters);
    expect(clientErrorPageFiltersToSearchParams(DEFAULT_CLIENT_ERROR_PAGE_FILTERS).toString()).toBe("");
  });
});

describe("getClientErrorRangeStart", () => {
  test("is relative to now, and undefined for all time", () => {
    expect(getClientErrorRangeStart("24h", 100 * 86_400_000)).toBe(99 * 86_400_000);
    expect(getClientErrorRangeStart("all", 1)).toBeUndefined();
  });
});
