import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteError } from "./operation";

// DELETE /api/admin/errors/{error_id}
export const { DELETE } = apiRouteHandlers([deleteError]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
