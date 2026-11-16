import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { lookupDeviceAuthorization } from "./operation";

// POST /api/auth/device/lookup
export const { POST } = apiRouteHandlers([lookupDeviceAuthorization]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
