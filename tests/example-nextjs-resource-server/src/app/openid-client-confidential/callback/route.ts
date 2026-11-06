import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoCallback } from "@/lib/openid-client-demo";
import { handleAgentsCallback, isAgentsCallback } from "@/lib/agents/auth/agents-sign-in";

/**
 * GET /openid-client-confidential/callback: the confidential client's
 * redirect_uri. Completes the agents app's sign-in when the `state` is the
 * one its login flow stored, the openid-client demo's otherwise.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isAgentsCallback(request)) {
    return await handleAgentsCallback(request);
  }
  return await handleOpenidClientDemoCallback(request, "confidential");
}

export const dynamic = "force-dynamic";
