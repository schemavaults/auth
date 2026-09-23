import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { webauthnLoginOptions } from "./operation";

// POST /api/auth/mfa/webauthn/options
export const { POST } = apiRouteHandlers([webauthnLoginOptions]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
