import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getTestEmailVerificationToken } from "./operation";

// GET /api/test/email-verification-token/{email}
export const { GET } = apiRouteHandlers([getTestEmailVerificationToken]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
