import { z } from "zod";

/**
 * How an RFC 8707 `resource` URL sent to the token endpoint is matched
 * against an API server's registered domains (which are stored as
 * origins, e.g. `https://api.example.com`):
 *
 * - `exact`: the resource must equal a registered domain (a trailing
 *   slash is tolerated). The default.
 * - `prefix`: the resource may also be any URL *under* a registered
 *   domain (`https://api.example.com/mcp`), which is how MCP clients
 *   identify a resource server hosted on a path. An API server opts into
 *   this looser matching explicitly.
 */
export const RESOURCE_URL_MATCH_MODES = [
  "exact",
  "prefix",
] as const satisfies readonly string[];

export type ResourceUrlMatchMode = (typeof RESOURCE_URL_MATCH_MODES)[number];

export const DEFAULT_RESOURCE_URL_MATCH_MODE =
  "exact" as const satisfies ResourceUrlMatchMode;

export const resourceUrlMatchModeSchema = z.enum(RESOURCE_URL_MATCH_MODES);

/**
 * Dynamic-client policy fields of an API server definition. Both are
 * optional on the wire (older SDK consumers and the hardcoded definitions
 * omit them); absent means "false" / `exact`.
 */
export const apiServerDynamicClientFieldsShape = {
  /**
   * Whether client applications registered through RFC 7591 dynamic
   * client registration may request access tokens for this API server
   * (as an RFC 8707 `resource`) without an explicit app-to-API connection.
   * Managed clients still need a connection regardless of this flag.
   */
  allow_dynamic_clients: z.boolean().optional(),
  /** See {@link RESOURCE_URL_MATCH_MODES}. */
  resource_url_match_mode: resourceUrlMatchModeSchema.optional(),
} as const;

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * @description Whether `resource_url` identifies the API server that
 * registered `domain`, under the given match mode. Both values are
 * compared after stripping one trailing slash; under `prefix` mode the
 * resource may additionally continue with a `/`-delimited path (a
 * different port or host never matches).
 */
export function doesResourceUrlMatchApiServerDomain(
  resource_url: string,
  domain: string,
  mode: ResourceUrlMatchMode = DEFAULT_RESOURCE_URL_MATCH_MODE,
): boolean {
  if (typeof resource_url !== "string" || typeof domain !== "string") {
    return false;
  }
  const resource: string = stripTrailingSlash(resource_url);
  const base: string = stripTrailingSlash(domain);
  if (resource.length === 0 || base.length === 0) {
    return false;
  }
  if (resource === base) {
    return true;
  }
  if (mode === "prefix") {
    return resource.startsWith(`${base}/`);
  }
  return false;
}
