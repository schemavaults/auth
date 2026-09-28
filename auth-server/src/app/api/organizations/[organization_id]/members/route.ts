import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { assignOrganizationMember, listOrganizationMembers } from "./operation";

// GET, POST /api/organizations/{organization_id}/members
export const { GET, POST } = apiRouteHandlers([listOrganizationMembers, assignOrganizationMember]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
