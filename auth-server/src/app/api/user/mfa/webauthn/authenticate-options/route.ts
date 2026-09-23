import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { beginPasskeyStepUp } from "./operation";

// POST /api/user/mfa/webauthn/authenticate-options
export const { POST } = apiRouteHandlers([beginPasskeyStepUp]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
