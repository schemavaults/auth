import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { removeTotpFactor } from "./operation";

// DELETE /api/user/mfa/totp/{factor_id}
export const { DELETE } = apiRouteHandlers([removeTotpFactor]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
