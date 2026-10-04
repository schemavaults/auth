import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { configurePurgeCronSecretBypass } from "./cron-bypass";
import { purgeExpiredClientErrorsViaGet, purgeExpiredClientErrorsViaPost } from "./operation";

// GET, POST /api/admin/client-errors/purge-expired
export const { GET, POST } = apiRouteHandlers([purgeExpiredClientErrorsViaGet, purgeExpiredClientErrorsViaPost], {
  configure: configurePurgeCronSecretBypass,
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
