import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteUserAccount } from "./operation";

// DELETE /api/admin/users/{uid}
export const { DELETE } = apiRouteHandlers([deleteUserAccount]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
