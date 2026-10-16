import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { setApiServerOrganizationMembershipVisibility } from "./operation";

// PUT /api/apis/{api_server_id}/organization-membership-visibility
export const { PUT } = apiRouteHandlers([setApiServerOrganizationMembershipVisibility]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
