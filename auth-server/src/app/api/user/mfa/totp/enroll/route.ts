import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { enrollTotp } from "./operation";

// POST /api/user/mfa/totp/enroll
export const { POST } = apiRouteHandlers([enrollTotp]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
