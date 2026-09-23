import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { requestPasswordReset } from "./operation";

// POST /api/auth/reset-password/request
export const { POST } = apiRouteHandlers([requestPasswordReset]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
