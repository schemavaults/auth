import { describe, expect, test } from "bun:test";
import type { AuthSessionRoutes } from "@/types/AuthSessionRoutes";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { AUTH_SESSION_ROUTE_PATHS, getSessionRouteUrls } from "./session-route";

function adapterWith(
  routes: (() => AuthSessionRoutes | null) | undefined,
): ISchemaVaultsAuthClientAdapter {
  return { getSessionRouteUrls: routes } as unknown as ISchemaVaultsAuthClientAdapter;
}

const ROUTES: AuthSessionRoutes = {
  token: "https://app.example.com/auth/session/token",
  whoami: "https://app.example.com/me",
  logout: "https://app.example.com/auth/session/logout",
};

describe("getSessionRouteUrls", () => {
  test("is null for adapters without session routes", () => {
    expect(getSessionRouteUrls(adapterWith(undefined))).toBeNull();
    expect(getSessionRouteUrls(adapterWith(() => null))).toBeNull();
  });

  test("is each route's own absolute URL", () => {
    expect(getSessionRouteUrls(adapterWith(() => ROUTES))).toEqual(ROUTES);
  });

  test("refuses a relative or missing route", () => {
    expect(() => getSessionRouteUrls(adapterWith(() => ({ ...ROUTES, whoami: "/me" })))).toThrow(
      "'whoami' session route",
    );
    expect(() =>
      getSessionRouteUrls(adapterWith(() => ({ ...ROUTES, logout: undefined }) as unknown as AuthSessionRoutes)),
    ).toThrow("'logout' session route");
  });

  test("codegen's route paths", () => {
    expect(AUTH_SESSION_ROUTE_PATHS).toEqual({
      token: "/auth/session/token",
      whoami: "/auth/session/whoami",
      logout: "/auth/session/logout",
    });
  });
});
