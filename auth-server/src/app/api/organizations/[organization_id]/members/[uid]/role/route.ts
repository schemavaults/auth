import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOrganizationMemberRole, updateOrganizationMemberRole } from "./operation";

// GET, PATCH /api/organizations/{organization_id}/members/{uid}/role
export const { GET, PATCH } = apiRouteHandlers([getOrganizationMemberRole, updateOrganizationMemberRole]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
