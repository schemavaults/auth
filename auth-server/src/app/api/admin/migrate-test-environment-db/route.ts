import "server-only";
import type { ServerRuntime } from "next";

// we need nodejs for fs access on migrations/ directory
export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
export { POST } from "./POST_trigger_db_migration";
