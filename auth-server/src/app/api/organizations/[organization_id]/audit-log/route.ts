import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listOrganizationAuditLog } from "./operation";

// GET /api/organizations/[organization_id]/audit-log
export const { GET } = apiRouteHandlers([listOrganizationAuditLog]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
