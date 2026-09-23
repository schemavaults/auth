import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createAppCallbackUrl, listAppCallbackUrls } from "./operation";

// GET, POST /api/apps/{app_id}/callback-urls
export const { GET, POST } = apiRouteHandlers([listAppCallbackUrls, createAppCallbackUrl]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
