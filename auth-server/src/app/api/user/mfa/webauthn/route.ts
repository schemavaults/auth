import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listPasskeys } from "./operation";

// GET /api/user/mfa/webauthn
export const { GET } = apiRouteHandlers([listPasskeys]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
