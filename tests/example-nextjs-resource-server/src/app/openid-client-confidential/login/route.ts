// GET /openid-client-confidential/login
//
// Starts an OIDC authorization-code + PKCE sign-in against the auth
// server as a CONFIDENTIAL client: the app has a client secret
// registered on the auth server, so the token exchange in the callback
// authenticates with client_secret_basic on top of PKCE. Shares its
// implementation with the public-client variant
// (src/lib/openid-client-demo/login-handler.ts).

import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoLogin } from "@/lib/openid-client-demo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handleOpenidClientDemoLogin(request, "confidential");
}

export const dynamic = "force-dynamic";
