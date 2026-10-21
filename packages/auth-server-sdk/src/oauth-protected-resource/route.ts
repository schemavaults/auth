import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import getSchemaVaultsAuthServerUrl from "@/env/get-schemavaults-auth-server-url";
import {
  RESOURCE_URL_ENV_VAR_NAME,
  getSchemaVaultsResourceUrl,
  parseResourceUrl,
} from "@/env/get-schemavaults-resource-url";
import {
  type OAuthProtectedResourceMetadataDetails,
  buildOAuthProtectedResourceMetadata,
  isMetadataRequestForResource,
} from "./protected-resource-metadata";

export interface OAuthProtectedResourceMetadataRouteOptions
  extends OAuthProtectedResourceMetadataDetails {
  /**
   * The resource identifier. Default: `SCHEMAVAULTS_RESOURCE_URL`, which
   * `createSchemaVaultsAuthResolvers()` also accepts as a token audience;
   * when you set it here instead, pass the same URL to their
   * `acceptedAudiences`.
   */
  readonly resource?: string;
  /**
   * Issuer identifiers of the authorization servers. Default: the auth
   * server URL (`SCHEMAVAULTS_AUTH_SERVER_URL`, or the environment's
   * default auth server).
   */
  readonly authorization_servers?: readonly string[];
  /** Default: `getAppEnvironment()`, read per request. */
  readonly environment?: SchemaVaultsAppEnvironment;
}

export type OAuthProtectedResourceMetadataRouteHandler = (request: Request) => Promise<Response>;

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" } as const;

function jsonResponse(status: number, body: unknown, cache_control: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": cache_control,
    },
  });
}

function errorResponse(status: 404 | 500, error: string, message: string): Response {
  return jsonResponse(status, { error, message }, "no-store");
}

/**
 * The OAuth 2.0 Protected Resource Metadata route (RFC 9728): tells
 * OAuth clients (MCP clients, for one) which authorization server issues
 * tokens for this resource server and which `resource` URL to request
 * them for. In Next.js, `app/.well-known/oauth-protected-resource/[[...path]]/route.ts`
 * (the optional catch-all also answers the path-suffixed URLs of RFC 9728
 * §3.1):
 *
 * ```ts
 * export const { GET, OPTIONS } = createOAuthProtectedResourceMetadataRoute({
 *   resource_name: "My API",
 *   resource_documentation: "/docs",
 * });
 * ```
 *
 * `GET` answers the document with `Access-Control-Allow-Origin: *` (it is
 * public; browser-based clients read it cross-origin) and a one-hour
 * cache; `OPTIONS` answers CORS preflights. Without a resource URL
 * (`SCHEMAVAULTS_RESOURCE_URL` unset) the route answers 404: the server
 * publishes no metadata. A path-suffixed request for a different resource
 * is a 404 too; an invalid resource URL is a 500.
 */
export function createOAuthProtectedResourceMetadataRoute(
  options: OAuthProtectedResourceMetadataRouteOptions = {},
): {
  GET: OAuthProtectedResourceMetadataRouteHandler;
  OPTIONS: OAuthProtectedResourceMetadataRouteHandler;
} {
  let warned_not_configured: boolean = false;

  const GET: OAuthProtectedResourceMetadataRouteHandler = async (request) => {
    let resource: string | null;
    let authorization_servers: readonly string[];
    try {
      resource =
        options.resource !== undefined
          ? parseResourceUrl(options.resource, options.environment)
          : getSchemaVaultsResourceUrl(options.environment);
      authorization_servers = options.authorization_servers ?? [getSchemaVaultsAuthServerUrl()];
    } catch (e: unknown) {
      console.error("[oauth-protected-resource] The protected resource metadata is misconfigured:", e);
      return errorResponse(
        500,
        "server_misconfiguration",
        "The protected resource metadata of this server is misconfigured.",
      );
    }

    if (resource === null) {
      if (!warned_not_configured) {
        warned_not_configured = true;
        console.warn(
          `[oauth-protected-resource] '${RESOURCE_URL_ENV_VAR_NAME}' is not set; answering 404 to protected resource metadata requests.`,
        );
      }
      return errorResponse(404, "not_found", "This server does not publish protected resource metadata.");
    }
    if (!isMetadataRequestForResource(new URL(request.url).pathname, resource)) {
      return errorResponse(404, "not_found", "No protected resource is published at this path.");
    }

    return jsonResponse(
      200,
      buildOAuthProtectedResourceMetadata({ ...options, resource, authorization_servers }),
      "public, max-age=3600",
    );
  };

  const OPTIONS: OAuthProtectedResourceMetadataRouteHandler = async (request) => {
    const requested_headers: string | null = request.headers.get("Access-Control-Request-Headers");
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        ...(requested_headers ? { "Access-Control-Allow-Headers": requested_headers } : {}),
        "Access-Control-Max-Age": "86400",
      },
    });
  };

  return { GET, OPTIONS };
}

export default createOAuthProtectedResourceMetadataRoute;
