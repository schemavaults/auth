import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { handleOidcDeviceAuthorizationPreflight } from "./cors";
import { postOidcDeviceAuthorization } from "./operation";

// POST, OPTIONS /api/oidc/device_authorization
export const { POST, OPTIONS } = apiRouteHandlers([postOidcDeviceAuthorization], {
  preflight: () => handleOidcDeviceAuthorizationPreflight(),
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
