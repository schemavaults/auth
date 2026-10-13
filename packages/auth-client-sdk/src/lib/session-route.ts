import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export type SessionRouteAction = "token" | "whoami" | "logout";

/**
 * The hosting app's same-origin auth session route, if its adapter has one
 * (see `ISchemaVaultsAuthClientAdapter.getSessionRouteUrl`), without a
 * trailing slash.
 */
export function getSessionRouteUrl(
  adapter: ISchemaVaultsAuthClientAdapter,
): string | null {
  if (typeof adapter.getSessionRouteUrl !== "function") {
    return null;
  }
  const url: string | null = adapter.getSessionRouteUrl();
  if (typeof url !== "string" || url.length === 0) {
    return null;
  }
  if (!/^https?:\/\//.test(url)) {
    throw new TypeError(
      `Expected the adapter's session route to be an absolute http(s) URL, got '${url}'`,
    );
  }
  return url.replace(/\/+$/, "");
}

/** URL of one action of the session route. */
export function sessionRouteEndpoint(route: string, action: SessionRouteAction): string {
  return `${route}/${action}`;
}
