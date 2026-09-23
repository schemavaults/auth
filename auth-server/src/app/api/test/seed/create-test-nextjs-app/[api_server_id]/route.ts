import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createTestNextjsApp } from "./operation";

// POST /api/test/seed/create-test-nextjs-app/{api_server_id}
export const { POST } = apiRouteHandlers([createTestNextjsApp]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
