import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { resetRateLimits } from "./operation";

// POST /api/test/reset-rate-limit
export const { POST } = apiRouteHandlers([resetRateLimits]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
