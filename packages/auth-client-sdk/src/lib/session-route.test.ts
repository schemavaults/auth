import { describe, expect, test } from "bun:test";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { getSessionRouteUrl, sessionRouteEndpoint } from "./session-route";

function adapterWith(route: (() => string | null) | undefined): ISchemaVaultsAuthClientAdapter {
  return { getSessionRouteUrl: route } as unknown as ISchemaVaultsAuthClientAdapter;
}

describe("getSessionRouteUrl", () => {
  test("is null for adapters without a session route", () => {
    expect(getSessionRouteUrl(adapterWith(undefined))).toBeNull();
    expect(getSessionRouteUrl(adapterWith(() => null))).toBeNull();
    expect(getSessionRouteUrl(adapterWith(() => ""))).toBeNull();
  });

  test("is the route's absolute URL without a trailing slash", () => {
    const route = getSessionRouteUrl(adapterWith(() => "https://app.example.com/auth/session/"));
    expect(route).toBe("https://app.example.com/auth/session");
    expect(sessionRouteEndpoint(route as string, "whoami")).toBe(
      "https://app.example.com/auth/session/whoami",
    );
  });

  test("refuses a relative route", () => {
    expect(() => getSessionRouteUrl(adapterWith(() => "/auth/session"))).toThrow(TypeError);
  });
});
