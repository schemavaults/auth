import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { removePasskey } from "./operation";

// DELETE /api/user/mfa/webauthn/{factor_id}
export const { DELETE } = apiRouteHandlers([removePasskey]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
