import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getMyOrganizationRole } from "./operation";

// GET /api/me/organizations/{organization_id}/role
export const { GET } = apiRouteHandlers([getMyOrganizationRole]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
