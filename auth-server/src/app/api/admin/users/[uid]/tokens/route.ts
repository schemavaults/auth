import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listUserIssuedTokens } from "./operation";

// GET /api/admin/users/{uid}/tokens
export const { GET } = apiRouteHandlers([listUserIssuedTokens]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
