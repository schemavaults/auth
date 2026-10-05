import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import {
  deleteAppServiceAccountOrganizationMembership,
  setAppServiceAccountOrganizationMembership,
} from "./operation";

// PUT, DELETE /api/apps/{app_id}/service-account/organization-membership
export const { PUT, DELETE } = apiRouteHandlers([
  setAppServiceAccountOrganizationMembership,
  deleteAppServiceAccountOrganizationMembership,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
