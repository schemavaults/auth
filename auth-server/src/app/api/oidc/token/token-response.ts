import "server-only";
import { NextResponse } from "next/server";
import type { OidcTokenResponseBody } from "@/lib/oidc/issue-oidc-tokens";

// CORS: the endpoint serves third-party public clients (PKCE, no
// cookies, credentials in the form body) so a wildcard origin is safe.
// Confidential clients call server-to-server (no CORS involved), but
// Authorization is allowed so browser-based tooling can still exercise
// client_secret_basic against dev deployments.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/**
 * RFC 6749 §5.1 success response: JSON body with no-store caching (§5.1
 * requires the authorization server to prevent caching of token
 * responses) plus the public-client CORS headers.
 */
export function oidcTokenSuccessResponse(
  body: OidcTokenResponseBody,
): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Accessor over the token request's form fields; returns null for
 * absent OR empty values so handlers treat `?scope=` like a missing
 * parameter. Built once in route.ts from the parsed FormData and passed
 * into each grant handler.
 */
export type OidcTokenFormParam = (name: string) => string | null;
