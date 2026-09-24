import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { verifyMfaChallenge } from "./operation";

// POST /api/auth/mfa/verify
export const { POST } = apiRouteHandlers([verifyMfaChallenge]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
