import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getAudienceJwks } from "./operation";

// GET /api/jwks/{audience}
export const { GET } = apiRouteHandlers([getAudienceJwks]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
