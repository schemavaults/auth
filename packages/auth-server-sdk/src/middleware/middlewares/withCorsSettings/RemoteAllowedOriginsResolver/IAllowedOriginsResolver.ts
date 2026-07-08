import type { ApiServerId } from "@schemavaults/app-definitions";

/**
 * Resolves the list of origins allowed to make cross-origin requests to a
 * resource server: the domains of every client app connected to the given
 * API server.
 */
export interface IAllowedOriginsResolver {
  loadAllowedOrigins(api_server_id: ApiServerId): Promise<readonly string[]>;
  isConfigured(): boolean;
}

export function isAllowedOriginsResolver(
  value: unknown,
): value is IAllowedOriginsResolver {
  return (
    typeof value === "object" &&
    value !== null &&
    "loadAllowedOrigins" in value &&
    typeof value.loadAllowedOrigins === "function" &&
    "isConfigured" in value &&
    typeof value.isConfigured === "function"
  );
}
