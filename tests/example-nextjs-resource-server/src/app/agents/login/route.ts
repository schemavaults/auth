import type { NextRequest, NextResponse } from "next/server";
import { handleAgentsLogin } from "@/lib/agents/auth/agents-sign-in";

/** Signs the user in to the agents app (see agents-sign-in.ts). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAgentsLogin(request);
}
