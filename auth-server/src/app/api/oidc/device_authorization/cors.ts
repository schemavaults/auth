import "server-only";
import { NextResponse } from "next/server";

// CORS: the device authorization endpoint reads no cookies (the client
// identifies itself in the body or with HTTP Basic), so a wildcard allowance
// without credentials is safe: starting a device flow only yields codes the
// caller then has to get a user to approve on the auth server. The shared
// error helper already emits Access-Control-Allow-Origin: * on errors.
export const DEVICE_AUTHORIZATION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** CORS preflight. */
export async function handleOidcDeviceAuthorizationPreflight(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: DEVICE_AUTHORIZATION_CORS_HEADERS,
  });
}
