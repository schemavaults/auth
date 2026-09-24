import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { confirmEmailVerification } from "./operation";

// POST /api/auth/verify-email/confirm
export const { POST } = apiRouteHandlers([confirmEmailVerification]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
