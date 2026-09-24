import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createApiServer, listApiServers } from "./operation";

// GET, POST /api/apis
export const { GET, POST } = apiRouteHandlers([listApiServers, createApiServer]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
