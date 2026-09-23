import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { getOidcJwks } from "./operation";

// GET /api/oidc/jwks
export const { GET } = apiRouteHandlers([getOidcJwks]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
