import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { regenerateRecoveryCodes } from "./operation";

// POST /api/user/mfa/recovery-codes/regenerate
export const { POST } = apiRouteHandlers([regenerateRecoveryCodes]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
