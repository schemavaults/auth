import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createInviteCode, listInviteCodes } from "./operation";

// GET, POST /api/admin/invite-codes
export const { GET, POST } = apiRouteHandlers([listInviteCodes, createInviteCode]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
