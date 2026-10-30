import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOrganizationMfaRequirementOperation, updateOrganizationMfaRequirementOperation } from "./operation";

// GET, PUT /api/organizations/{organization_id}/mfa-requirement
export const { GET, PUT } = apiRouteHandlers([
  getOrganizationMfaRequirementOperation,
  updateOrganizationMfaRequirementOperation,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
