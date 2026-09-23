import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getBrandingConfig } from "./operation";

// GET /api/config/branding
export const { GET } = apiRouteHandlers([getBrandingConfig]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
