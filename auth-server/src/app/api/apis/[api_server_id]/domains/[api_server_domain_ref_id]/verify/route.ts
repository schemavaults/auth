import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { verifyApiServerDomainOperation } from "./operation";

// POST /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}/verify
export const { POST } = apiRouteHandlers([verifyApiServerDomainOperation]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
