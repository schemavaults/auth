import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createOrganizationInvitationOperation, listOrganizationInvitationsOperation } from "./operation";

// GET, POST /api/organizations/{organization_id}/invitations
export const { GET, POST } = apiRouteHandlers([
  listOrganizationInvitationsOperation,
  createOrganizationInvitationOperation,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
