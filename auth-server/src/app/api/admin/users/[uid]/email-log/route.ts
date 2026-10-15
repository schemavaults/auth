import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listUserEmailLog } from "./operation";

// GET /api/admin/users/{uid}/email-log
export const { GET } = apiRouteHandlers([listUserEmailLog]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
