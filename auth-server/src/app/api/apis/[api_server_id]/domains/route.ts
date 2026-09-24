import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { addApiServerDomain, listApiServerDomains } from "./operation";

// GET, POST /api/apis/{api_server_id}/domains
export const { GET, POST } = apiRouteHandlers([listApiServerDomains, addApiServerDomain]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
