import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createAppDomain, listAppDomains } from "./operation";

// GET, POST /api/apps/{app_id}/domains
export const { GET, POST } = apiRouteHandlers([listAppDomains, createAppDomain]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
