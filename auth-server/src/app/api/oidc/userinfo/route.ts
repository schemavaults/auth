import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOidcUserinfo, postOidcUserinfo } from "./operation";
import { handleOidcUserinfoPreflight } from "./userinfo-handler";

// GET, POST, OPTIONS /api/oidc/userinfo
export const { GET, POST, OPTIONS } = apiRouteHandlers([getOidcUserinfo, postOidcUserinfo], {
  preflight: () => handleOidcUserinfoPreflight(),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
