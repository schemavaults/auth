import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { removeBrandingAsset, uploadBrandingAsset } from "./operation";

// PUT, DELETE /api/admin/branding/{asset}
export const { PUT, DELETE } = apiRouteHandlers([uploadBrandingAsset, removeBrandingAsset]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
