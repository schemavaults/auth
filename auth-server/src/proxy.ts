import { NextResponse, type NextRequest } from "next/server";
import {
  NEXT_HREF_REQUEST_HEADER,
  sanitizeNextHref,
} from "@schemavaults/auth-common";

/**
 * Next.js proxy (formerly middleware) for the auth-server.
 *
 * Server components cannot introspect the URL of the request they are
 * rendering for, so the authenticated/admin route guards cannot know
 * which page an unauthenticated user was trying to reach when they
 * bounce them to /auth/login. This proxy stamps the sanitized
 * pathname+search of every page request into a request header
 * (`NEXT_HREF_REQUEST_HEADER`) that the guards read as a fallback
 * `next_href`, so the post-login redirect can return the user to their
 * original destination — including for guards invoked from layouts
 * (e.g. the /admin layout guard), which have no per-page path to pass.
 *
 * The inbound header is always deleted first: clients must never be
 * able to choose the post-login destination by sending the header
 * themselves.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(NEXT_HREF_REQUEST_HEADER);

  const candidate: string =
    request.nextUrl.pathname + request.nextUrl.search;
  const sanitized: string | null = sanitizeNextHref(candidate);
  if (sanitized) {
    requestHeaders.set(NEXT_HREF_REQUEST_HEADER, sanitized);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  // Page requests only — skip Next.js internals, static assets, API
  // routes (their guards return 401 JSON rather than redirecting), and
  // the branding asset routes.
  matcher: ["/((?!_next/|api/|branding/|favicon.ico).*)"],
};
