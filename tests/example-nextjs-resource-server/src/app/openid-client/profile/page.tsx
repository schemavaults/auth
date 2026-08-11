// /openid-client/profile
//
// Displays the identity established by the PUBLIC-client openid-client
// demo sign-in flow. Rendering lives in the shared component at
// src/lib/openid-client-demo/profile.tsx (data-testid hooks prefixed
// `openid-client-`).

import "server-only";
import type { ReactElement } from "react";
import { renderOpenidClientDemoProfilePage } from "@/lib/openid-client-demo";

export default async function OpenidClientProfilePage(): Promise<ReactElement> {
  return await renderOpenidClientDemoProfilePage("public");
}

export const dynamic = "force-dynamic";
