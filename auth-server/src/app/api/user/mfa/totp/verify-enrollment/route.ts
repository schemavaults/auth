import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { verifyTotpEnrollment } from "./operation";

// POST /api/user/mfa/totp/verify-enrollment
export const { POST } = apiRouteHandlers([verifyTotpEnrollment]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
