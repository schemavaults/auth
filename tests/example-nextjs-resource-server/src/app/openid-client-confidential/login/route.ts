import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoLogin } from "@/lib/openid-client-demo";
import { handleAgentsLogin, isAgentsSignIn } from "@/lib/agents/auth/agents-sign-in";

/**
 * GET /openid-client-confidential/login: signs the user in as the
 * confidential client. With `?next=/agents` it signs them in to the agents
 * app (/agents) instead of the openid-client demo, asking for the example
 * API and the scopes an agent may be given (see agents-sign-in.ts).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isAgentsSignIn(request)) {
    return await handleAgentsLogin(request);
  }
  return await handleOpenidClientDemoLogin(request, "confidential");
}

export const dynamic = "force-dynamic";
