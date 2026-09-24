import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { enrollTestUserMfa } from "./operation";

// POST /api/test/seed/enroll-test-user-mfa
export const { POST } = apiRouteHandlers([enrollTestUserMfa]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
