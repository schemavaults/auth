import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listAllUsers } from "./operation";

// GET /api/admin/users/list
export const { GET } = apiRouteHandlers([listAllUsers]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
