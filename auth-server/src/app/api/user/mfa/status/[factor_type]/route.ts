import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getMfaFactorTypeStatus } from "./operation";

// GET /api/user/mfa/status/{factor_type}
export const { GET } = apiRouteHandlers([getMfaFactorTypeStatus]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
