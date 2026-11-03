import "server-only";
import { NextResponse } from "next/server";

// CORS: revocation reads no cookies (the token travels in the request body),
// so a wildcard allowance without credentials lets browser-based public
// clients revoke their tokens on sign-out while exposing nothing: a page can
// only revoke a token it already holds. The shared error helper already
// emits Access-Control-Allow-Origin: * on error responses.
export const REVOCATION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** CORS preflight. */
export async function handleOidcRevokePreflight(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: REVOCATION_CORS_HEADERS,
  });
}
