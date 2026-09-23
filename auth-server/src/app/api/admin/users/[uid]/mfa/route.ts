import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listUserMfaFactorTypes, resetUserMfa } from "./operation";

// GET, DELETE /api/admin/users/{uid}/mfa
export const { GET, DELETE } = apiRouteHandlers([listUserMfaFactorTypes, resetUserMfa]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
