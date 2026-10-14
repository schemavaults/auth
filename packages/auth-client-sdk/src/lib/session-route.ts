import type { AuthSessionRoutes } from "@/types/AuthSessionRoutes";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

/**
 * Where `auth-server-sdk codegen` writes the auth session routes
 * (`app/auth/session/{token,whoami,logout}/route.ts`).
 */
export const AUTH_SESSION_ROUTE_PATHS = {
  token: "/auth/session/token",
  whoami: "/auth/session/whoami",
  logout: "/auth/session/logout",
} as const satisfies AuthSessionRoutes;

const ROUTE_NAMES = ["token", "whoami", "logout"] as const satisfies readonly (keyof AuthSessionRoutes)[];

/**
 * The absolute URLs of the hosting app's auth session routes, if its adapter
 * has them (see `ISchemaVaultsAuthClientAdapter.getSessionRouteUrls`).
 */
export function getSessionRouteUrls(
  adapter: ISchemaVaultsAuthClientAdapter,
): AuthSessionRoutes | null {
  if (typeof adapter.getSessionRouteUrls !== "function") {
    return null;
  }
  const urls: AuthSessionRoutes | null = adapter.getSessionRouteUrls();
  if (!urls) {
    return null;
  }
  for (const name of ROUTE_NAMES) {
    const url: unknown = urls[name];
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
      throw new TypeError(
        `Expected the adapter's '${name}' session route to be an absolute http(s) URL, got '${String(url)}'`,
      );
    }
  }
  return urls;
}
