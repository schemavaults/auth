import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { logout } from "./operation";
import { logoutPreflight } from "./preflight";

// POST, OPTIONS /api/auth/logout/{client_app_id}
export const { POST, OPTIONS } = apiRouteHandlers([logout], { preflight: logoutPreflight });

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
