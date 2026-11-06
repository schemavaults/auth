import type { NextRequest, NextResponse } from "next/server";
import { handleAgentsCallback } from "@/lib/agents/auth/agents-sign-in";

/** The agents app's redirect_uri (see agents-sign-in.ts). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAgentsCallback(request);
}
