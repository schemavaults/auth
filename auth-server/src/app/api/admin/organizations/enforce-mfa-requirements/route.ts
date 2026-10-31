import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { enforceOrganizationMfaRequirementsViaGet, enforceOrganizationMfaRequirementsViaPost } from "./operation";

// GET  /api/admin/organizations/enforce-mfa-requirements — the scheduled job (cron secret only)
// POST /api/admin/organizations/enforce-mfa-requirements — platform administrators (session only)
export const { GET, POST } = apiRouteHandlers([
  enforceOrganizationMfaRequirementsViaGet,
  enforceOrganizationMfaRequirementsViaPost,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
