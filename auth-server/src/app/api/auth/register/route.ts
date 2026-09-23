import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { register } from "./operation";

// POST /api/auth/register
export const { POST } = apiRouteHandlers([register]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
