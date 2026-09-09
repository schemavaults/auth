import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import {
  buildCorsHeaders,
  type CorsValidationResult,
} from "@/lib/cors/cors-for-client-app";
import type { IssuedOidcTokens } from "@/lib/oidc/issue-oidc-tokens";

// CORS for requests that carry no `Origin` header, or come from an
// origin the client app has not registered: third-party public clients
// (PKCE, no cookies, credentials in the form body) may call the token
// endpoint from anywhere, so a wildcard origin is safe. Requests from a
// client app's REGISTERED origin instead get a credentialed allowance
// (see `applyOidcTokenCors`) so the SDK's cookie-delivered refresh
// tokens work cross-site. Confidential clients call server-to-server
// (no CORS involved), but Authorization is allowed so browser-based
// tooling can still exercise client_secret_basic against dev
// deployments.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/**
 * Applies the CORS allowance computed by the route to a response: the
 * wildcard headers for anonymous callers, or the per-client-app
 * credentialed allowance (echoed origin + `Allow-Credentials: true`)
 * when the request came from one of the client's registered origins.
 * Applied to error responses too, so a browser can read the failure
 * instead of surfacing a generic CORS error.
 */
export function applyOidcTokenCors<R extends NextResponse>(
  response: R,
  cors: CorsValidationResult | null,
): R {
  const headers: HeadersInit =
    cors && cors.allowed && !cors.skipCorsHeaders && cors.origin
      ? buildCorsHeaders(cors.origin)
      : CORS_HEADERS;
  new Headers(headers).forEach((value: string, name: string): void => {
    response.headers.set(name, value);
  });
  return response;
}

/**
 * Accessor over the token request's form fields; returns null for
 * absent OR empty values so handlers treat `?scope=` like a missing
 * parameter. Built once in route.ts from the parsed FormData and passed
 * into each grant handler.
 */
export type OidcTokenFormParam = (name: string) => string | null;

/** Everything a grant handler needs, assembled by route.ts. */
export interface OidcGrantContext {
  dbh: ServerlessDatabase;
  request: NextRequest;
  form: FormData;
  param: OidcTokenFormParam;
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
  debug: boolean;
}

/**
 * A grant handler either fails with a ready-made RFC 6749 §5.2 error
 * response, or succeeds with the issued token set — which route.ts then
 * delivers (inline or cookie) and decorates with CORS headers.
 */
export type OidcGrantOutcome =
  | { ok: false; response: NextResponse }
  | { ok: true; issued: IssuedOidcTokens };
