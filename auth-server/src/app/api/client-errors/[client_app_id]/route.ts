import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { clientErrorsPreflight, configureClientErrorsGate } from "./gate";
import { reportClientError } from "./operation";

// POST, OPTIONS /api/client-errors/{client_app_id}
export const { POST, OPTIONS } = apiRouteHandlers([reportClientError], {
  preflight: clientErrorsPreflight,
  configure: configureClientErrorsGate,
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
