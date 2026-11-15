import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { approveDeviceAuthorizationOperation } from "./operation";

// POST /api/auth/device/approve
export const { POST } = apiRouteHandlers([approveDeviceAuthorizationOperation]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
