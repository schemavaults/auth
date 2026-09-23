import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getInviteCodeRequired } from "./operation";

// GET /api/config/invite_code_required
export const { GET } = apiRouteHandlers([getInviteCodeRequired]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
