import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { postOidcRegister } from "./operation";
import { handleDynamicClientRegistrationPreflight } from "./register-handler";

// POST, OPTIONS /api/oidc/register
export const { POST, OPTIONS } = apiRouteHandlers([postOidcRegister], {
  preflight: () => handleDynamicClientRegistrationPreflight(),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
