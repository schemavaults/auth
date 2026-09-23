import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { migrateTestEnvironmentDb, migrateTestEnvironmentDbViaGet } from "./operation";

// GET, POST /api/test/seed/migrate-test-environment-db
export const { GET, POST } = apiRouteHandlers([migrateTestEnvironmentDbViaGet, migrateTestEnvironmentDb]);

// we need nodejs for fs access on migrations/ directory
export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
