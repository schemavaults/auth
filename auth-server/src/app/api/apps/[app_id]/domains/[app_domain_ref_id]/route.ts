import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteAppDomain } from "./operation";

// DELETE /api/apps/{app_id}/domains/{app_domain_ref_id}
export const { DELETE } = apiRouteHandlers([deleteAppDomain]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
