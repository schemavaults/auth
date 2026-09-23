import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listServerSettings } from "./operation";

// GET /api/admin/settings
export const { GET } = apiRouteHandlers([listServerSettings]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
