import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { generateJwksAccessKey, getJwksAccessKeyMetadata, regenerateJwksAccessKey } from "./operation";

// GET, POST, PUT /api/apis/{api_server_id}/jwks-access-key
export const { GET, POST, PUT } = apiRouteHandlers([
  getJwksAccessKeyMetadata,
  generateJwksAccessKey,
  regenerateJwksAccessKey,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
