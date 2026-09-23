import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOrganizationMemberRoleForResourceServer } from "./operation";

// GET /api/resource-server/organizations/{organization_id}/members/{uid}/role
export const { GET } = apiRouteHandlers([getOrganizationMemberRoleForResourceServer]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
