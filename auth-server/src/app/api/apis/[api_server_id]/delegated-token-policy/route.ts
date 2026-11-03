import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { setApiServerDelegatedTokenPolicy } from "./operation";

// PUT /api/apis/{api_server_id}/delegated-token-policy
export const { PUT } = apiRouteHandlers([setApiServerDelegatedTokenPolicy]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
