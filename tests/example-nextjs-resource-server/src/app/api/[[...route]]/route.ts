import "server-only";
import type { ServerRuntime } from "next";
import { toNextRouteHandlers } from "@schemavaults/openapi-operations";
import { apiApp } from "@/lib/api/app";

// One catch-all route handler serves every operation declared in
// src/lib/api/operations.ts (and GET /api/openapi.json) through the Hono app.
export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = toNextRouteHandlers(apiApp);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
