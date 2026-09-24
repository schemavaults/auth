import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { resendUserVerificationEmail } from "./operation";

// POST /api/admin/users/{uid}/resend-verification
export const { POST } = apiRouteHandlers([resendUserVerificationEmail]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
