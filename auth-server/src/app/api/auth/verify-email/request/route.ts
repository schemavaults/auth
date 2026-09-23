import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { requestEmailVerification } from "./operation";

// POST /api/auth/verify-email/request
export const { POST } = apiRouteHandlers([requestEmailVerification]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
