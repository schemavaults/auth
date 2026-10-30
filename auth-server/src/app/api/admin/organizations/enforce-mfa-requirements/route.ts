import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { configureEnforceCronSecretBypass } from "./cron-bypass";
import { enforceOrganizationMfaRequirementsViaGet, enforceOrganizationMfaRequirementsViaPost } from "./operation";

// GET, POST /api/admin/organizations/enforce-mfa-requirements
export const { GET, POST } = apiRouteHandlers(
  [enforceOrganizationMfaRequirementsViaGet, enforceOrganizationMfaRequirementsViaPost],
  { configure: configureEnforceCronSecretBypass },
);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
