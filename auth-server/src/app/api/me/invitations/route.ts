import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listMyInvitations } from "./operation";

// GET /api/me/invitations
export const { GET } = apiRouteHandlers([listMyInvitations]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
