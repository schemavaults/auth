import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { verifyPasskeyEnrollment } from "./operation";

// POST /api/user/mfa/webauthn/verify-enrollment
export const { POST } = apiRouteHandlers([verifyPasskeyEnrollment]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
