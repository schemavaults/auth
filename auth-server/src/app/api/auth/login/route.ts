import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { login } from "./operation";

// POST /api/auth/login
export const { POST } = apiRouteHandlers([login]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
