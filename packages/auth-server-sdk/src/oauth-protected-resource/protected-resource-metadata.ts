/**
 * The well-known path suffix of OAuth 2.0 Protected Resource Metadata
 * (RFC 9728 §3).
 */
export const OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH =
  "/.well-known/oauth-protected-resource" as const;

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728 §2), as served by
 * resource servers built on this SDK. Tokens for them are presented as
 * `Authorization: Bearer` headers (the first-party access-token cookie is
 * not an RFC 6750 method, so it is not advertised).
 */
export interface OAuthProtectedResourceMetadata {
  /** The resource identifier: the URL clients request tokens for (RFC 8707 `resource`). */
  readonly resource: string;
  /** Issuer identifiers of the authorization servers that issue tokens for this resource. */
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly scopes_supported?: readonly string[];
  readonly resource_name?: string;
  readonly resource_documentation?: string;
  readonly resource_policy_uri?: string;
  readonly resource_tos_uri?: string;
}

/** Human-readable / optional members of the metadata a resource server may set. */
export interface OAuthProtectedResourceMetadataDetails {
  /** Scope values clients may request for this resource (`scopes_supported`). */
  readonly scopes_supported?: readonly string[];
  /** Name of the resource intended for display to end users (`resource_name`). */
  readonly resource_name?: string;
  /**
   * Developer documentation of the resource (`resource_documentation`). A
   * path (`/docs`) is resolved against the resource URL's origin.
   */
  readonly resource_documentation?: string;
  /** Policy on how clients may use the resource's data. Paths resolve like `resource_documentation`. */
  readonly resource_policy_uri?: string;
  /** Terms of service of the resource. Paths resolve like `resource_documentation`. */
  readonly resource_tos_uri?: string;
}

export interface BuildOAuthProtectedResourceMetadataOptions
  extends OAuthProtectedResourceMetadataDetails {
  /** The resource identifier, verbatim. */
  readonly resource: string;
  /** Issuer identifiers; one trailing slash is removed from each (issuers never carry one). */
  readonly authorization_servers: readonly string[];
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveAgainstResource(value: string, resource: string): string {
  return value.startsWith("/") ? new URL(value, new URL(resource).origin).href : value;
}

/**
 * @description Builds the protected resource metadata document. Optional
 * members are omitted when not set; `scopes_supported` is omitted when
 * empty.
 */
export function buildOAuthProtectedResourceMetadata(
  options: BuildOAuthProtectedResourceMetadataOptions,
): OAuthProtectedResourceMetadata {
  const { resource } = options;
  const uri = (value: string | undefined): string | undefined =>
    typeof value === "string" && value.length > 0
      ? resolveAgainstResource(value, resource)
      : undefined;
  const resource_documentation = uri(options.resource_documentation);
  const resource_policy_uri = uri(options.resource_policy_uri);
  const resource_tos_uri = uri(options.resource_tos_uri);
  return {
    resource,
    authorization_servers: options.authorization_servers.map(stripTrailingSlash),
    bearer_methods_supported: ["header"],
    ...(options.scopes_supported && options.scopes_supported.length > 0
      ? { scopes_supported: [...options.scopes_supported] }
      : {}),
    ...(options.resource_name ? { resource_name: options.resource_name } : {}),
    ...(resource_documentation ? { resource_documentation } : {}),
    ...(resource_policy_uri ? { resource_policy_uri } : {}),
    ...(resource_tos_uri ? { resource_tos_uri } : {}),
  };
}

/**
 * @description The URL a client fetches a resource's metadata from (RFC
 * 9728 §3.1): the well-known path inserted between the host and the
 * resource's path, without the path's terminating slash.
 *
 * `https://api.example.com` → `https://api.example.com/.well-known/oauth-protected-resource`;
 * `https://api.example.com/mcp` → `https://api.example.com/.well-known/oauth-protected-resource/mcp`.
 */
export function oauthProtectedResourceMetadataUrl(resource_url: string): string {
  const url = new URL(resource_url);
  const path: string = url.pathname === "/" ? "" : stripTrailingSlash(url.pathname);
  return `${url.origin}${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${path}`;
}

/**
 * @description Whether a metadata request for `request_pathname` is about
 * `resource_url`. The bare well-known path (and a request that reached
 * the handler under any other path, e.g. through a rewrite) is answered
 * for every resource; a path-suffixed request (RFC 9728 §3.1) only when
 * the suffix is the resource's path or a `/`-delimited path below it, as
 * MCP clients ask about their server URL (`/mcp/v1`) before falling back
 * to the bare path.
 */
export function isMetadataRequestForResource(
  request_pathname: string,
  resource_url: string,
): boolean {
  if (!request_pathname.startsWith(OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH)) {
    return true;
  }
  const suffix: string = stripTrailingSlash(
    request_pathname.slice(OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH.length),
  );
  if (suffix.length === 0) {
    return true;
  }
  if (!suffix.startsWith("/")) {
    return false;
  }
  const resource_path: string = stripTrailingSlash(new URL(resource_url).pathname);
  return (
    resource_path.length === 0 ||
    suffix === resource_path ||
    suffix.startsWith(`${resource_path}/`)
  );
}
