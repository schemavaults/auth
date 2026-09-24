import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { confirmPasswordReset } from "./operation";

// POST /api/auth/reset-password/confirm
export const { POST } = apiRouteHandlers([confirmPasswordReset]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
