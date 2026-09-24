import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listBrandingAssets } from "./operation";

// GET /api/admin/branding
export const { GET } = apiRouteHandlers([listBrandingAssets]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
