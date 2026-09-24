import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteOrganization } from "./operation";

// DELETE /api/organizations/{organization_id}
export const { DELETE } = apiRouteHandlers([deleteOrganization]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
