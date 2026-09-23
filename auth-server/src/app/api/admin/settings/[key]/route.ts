import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { updateServerSetting } from "./operation";

// PATCH /api/admin/settings/{key}
export const { PATCH } = apiRouteHandlers([updateServerSetting]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
