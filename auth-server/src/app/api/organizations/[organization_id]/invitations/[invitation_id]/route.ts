import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { respondToOrganizationInvitation, revokeOrganizationInvitation } from "./operation";

// PATCH, DELETE /api/organizations/{organization_id}/invitations/{invitation_id}
export const { PATCH, DELETE } = apiRouteHandlers([respondToOrganizationInvitation, revokeOrganizationInvitation]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
