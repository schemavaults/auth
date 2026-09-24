import "server-only";
import { NextRequest } from "next/server";

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A `NextRequest` view of the raw request handed to an operation handler or
 * Hono middleware, for handlers still written against Next.js' request API
 * (`req.json()`, `req.cookies`, `req.nextUrl`, ...).
 *
 * `new NextRequest(request)` copies a Request by consuming it, so it throws
 * ("Request object that has already been used") when the runtime already
 * validated a declared body, or when two views of the same request are
 * built (a preflight handler plus CORS middleware, say). Building the copy
 * from the URL, method and headers avoids that; a still-unread body stream
 * is handed over for methods that carry one.
 */
export function toNextRequest(request: Request): NextRequest {
  if (request instanceof NextRequest) return request;
  const canCarryBody =
    !BODYLESS_METHODS.has(request.method.toUpperCase()) &&
    request.body !== null &&
    !request.bodyUsed;
  return new NextRequest(request.url, {
    method: request.method,
    headers: request.headers,
    ...(canCarryBody ? { body: request.body, duplex: "half" } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);
}
