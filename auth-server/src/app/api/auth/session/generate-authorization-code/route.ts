import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { generateAuthorizationCodeOperation } from "./operation";

// POST /api/auth/session/generate-authorization-code
export const { POST } = apiRouteHandlers([generateAuthorizationCodeOperation]);

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
