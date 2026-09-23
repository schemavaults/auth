import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { disableUser, enableUser } from "./operation";

// POST, DELETE /api/admin/users/{uid}/disable
export const { POST, DELETE } = apiRouteHandlers([disableUser, enableUser]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
