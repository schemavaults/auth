import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getMfaStatus } from "./operation";

// GET /api/user/mfa/status
export const { GET } = apiRouteHandlers([getMfaStatus]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
