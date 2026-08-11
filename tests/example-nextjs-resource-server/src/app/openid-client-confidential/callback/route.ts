// GET /openid-client-confidential/callback
//
// OIDC redirect_uri for the CONFIDENTIAL-client openid-client demo
// sign-in flow: openid-client redeems the authorization code with the
// PKCE verifier *and* the registered client secret, sent as an HTTP
// Basic Authorization header (client_secret_basic, RFC 6749 §2.3.1).
// Shares its implementation with the public-client variant
// (src/lib/openid-client-demo/callback-handler.ts).

import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoCallback } from "@/lib/openid-client-demo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handleOpenidClientDemoCallback(request, "confidential");
}

export const dynamic = "force-dynamic";
