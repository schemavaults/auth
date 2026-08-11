// GET /openid-client/callback
//
// OIDC redirect_uri for the PUBLIC-client openid-client demo sign-in
// flow. The code redemption, id_token validation and userinfo
// cross-check live in the shared handler at
// src/lib/openid-client-demo/callback-handler.ts, which the
// confidential variant (/openid-client-confidential/callback) reuses.

import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoCallback } from "@/lib/openid-client-demo";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handleOpenidClientDemoCallback(request, "public");
}

export const dynamic = "force-dynamic";
