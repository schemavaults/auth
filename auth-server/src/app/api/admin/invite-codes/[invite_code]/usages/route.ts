import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { countInviteCodeUsages } from "./operation";

// GET /api/admin/invite-codes/{invite_code}/usages
export const { GET } = apiRouteHandlers([countInviteCodeUsages]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
