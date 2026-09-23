import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { promoteUserToAdmin } from "./operation";

// POST /api/admin/promote/{uid}
export const { POST } = apiRouteHandlers([promoteUserToAdmin]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
