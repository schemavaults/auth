// /openid-client-confidential/profile
//
// Displays the identity established by the CONFIDENTIAL-client
// openid-client demo sign-in flow. Rendering lives in the shared
// component at src/lib/openid-client-demo/profile.tsx (data-testid
// hooks prefixed `openid-client-confidential-`).

import "server-only";
import type { ReactElement } from "react";
import { renderOpenidClientDemoProfilePage } from "@/lib/openid-client-demo";

export default async function OpenidClientConfidentialProfilePage(): Promise<ReactElement> {
  return await renderOpenidClientDemoProfilePage("confidential");
}

export const dynamic = "force-dynamic";
