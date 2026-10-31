import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { expireTestOrganizationMfaGracePeriod } from "./operation";

// POST /api/test/seed/expire-organization-mfa-grace-period
export const { POST } = apiRouteHandlers([expireTestOrganizationMfaGracePeriod]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
