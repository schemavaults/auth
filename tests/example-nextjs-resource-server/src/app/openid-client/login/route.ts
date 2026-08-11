// GET /openid-client/login
//
// Starts an OIDC authorization-code + PKCE sign-in against the auth
// server as a PUBLIC client (no client secret; token endpoint auth
// method `none`). The flow itself lives in the shared handler at
// src/lib/openid-client-demo/login-handler.ts, which the confidential
// variant (/openid-client-confidential/login) reuses.

import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoLogin } from "@/lib/openid-client-demo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handleOpenidClientDemoLogin(request, "public");
}

export const dynamic = "force-dynamic";
