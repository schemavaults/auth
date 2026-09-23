import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { configureWhoamiCors, whoamiPreflight } from "./cors";
import { whoami } from "./operation";

// GET, OPTIONS /api/auth/whoami/{client_app_id}
export const { GET, OPTIONS } = apiRouteHandlers([whoami], {
  preflight: whoamiPreflight,
  configure: configureWhoamiCors,
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
