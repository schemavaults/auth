import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listOrganizationMembers } from "./operation";

// GET /api/organizations/{organization_id}/members
export const { GET } = apiRouteHandlers([listOrganizationMembers]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
