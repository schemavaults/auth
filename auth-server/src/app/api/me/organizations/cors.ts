import "server-only";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { buildCorsHeaders } from "@/lib/cors/cors-for-client-app";

export const MY_ORGANIZATIONS_ROUTE = "/api/me/organizations";
const CORS_METHODS = "GET, OPTIONS" as const;

/**
 * CORS headers letting this endpoint be called from any domain.
 *
 * When the request originates from the auth-server itself, its own origin is
 * reflected and credentials are allowed so the cookie-based session is
 * accepted. For any other origin, "Access-Control-Allow-Origin: *" is used;
 * credentials are omitted because the CORS spec forbids "*" together with
 * Access-Control-Allow-Credentials: true, and external apps authenticate with
 * an Authorization Bearer token rather than cookies.
 */
function corsHeadersForOrigin(origin: string): Headers {
  return new Headers(
    origin === getAuthServerUri()
      ? buildCorsHeaders(origin, CORS_METHODS)
      : {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": CORS_METHODS,
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
          Vary: "Origin",
        },
  );
}

/**
 * Returns `response` with the CORS headers for the request's `Origin`
 * applied (unchanged when the request carries no Origin header). Builds a
 * new Response so it also works for responses with immutable headers.
 */
export function withMyOrganizationsCorsHeaders(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin");
  if (!origin) return response;
  const headers = new Headers(response.headers);
  corsHeadersForOrigin(origin).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** `OPTIONS /api/me/organizations`: a 204 preflight answer with the CORS headers. */
export function myOrganizationsPreflight(request: Request): Response {
  return withMyOrganizationsCorsHeaders(request, new Response(null, { status: 204 }));
}
