import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { beginPasskeyEnrollment } from "./operation";

// POST /api/user/mfa/webauthn/options
export const { POST } = apiRouteHandlers([beginPasskeyEnrollment]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
