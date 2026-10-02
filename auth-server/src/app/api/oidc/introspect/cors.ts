import "server-only";
import { NextResponse } from "next/server";

// CORS: introspection is a server-to-server surface (it requires a
// client secret or a JWKS access key, which never belong in a browser),
// but the wildcard mirrors the rest of the OIDC surface — and the shared
// error helper already emits Access-Control-Allow-Origin: * — so dev
// tooling can still exercise the endpoint from a browser context.
export const INTROSPECTION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** CORS preflight. */
export async function handleOidcIntrospectPreflight(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: INTROSPECTION_CORS_HEADERS,
  });
}
