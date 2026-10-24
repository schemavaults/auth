import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteApiServerDomain } from "./operation";

// DELETE /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}
export const { DELETE } = apiRouteHandlers([deleteApiServerDomain]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
