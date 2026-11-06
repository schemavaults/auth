import type { NextRequest, NextResponse } from "next/server";
import { handleAgentsLogout } from "@/lib/agents/auth/agents-sign-in";

/**
 * Signs the user out of the agents app. POST-only, so a prefetch or an
 * <img> on another site cannot sign anyone out.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleAgentsLogout(request);
}
