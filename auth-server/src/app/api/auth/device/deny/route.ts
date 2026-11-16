import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { denyDeviceAuthorization } from "./operation";

// POST /api/auth/device/deny
export const { POST } = apiRouteHandlers([denyDeviceAuthorization]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
