// POST /openid-client-confidential/logout
//
// Clears the CONFIDENTIAL-client openid-client demo session cookie and
// redirects back to the profile page. POST-only (the profile page
// submits a form) so a prefetch or a cross-site image request cannot
// sign the user out. Shares its implementation with the public-client
// variant (src/lib/openid-client-demo/logout-handler.ts).

import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { handleOpenidClientDemoLogout } from "@/lib/openid-client-demo";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return await handleOpenidClientDemoLogout(request, "confidential");
}

export const dynamic = "force-dynamic";
