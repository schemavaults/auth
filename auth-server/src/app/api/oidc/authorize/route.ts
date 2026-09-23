import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { oidcAuthorize } from "./operation";

// GET /api/oidc/authorize
export const { GET } = apiRouteHandlers([oidcAuthorize]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
