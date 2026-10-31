import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listMyOrganizationMfaRequirements } from "./operation";

// GET /api/me/organization-mfa-requirements
export const { GET } = apiRouteHandlers([listMyOrganizationMfaRequirements]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
