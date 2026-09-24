import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import {
  deleteClientSecret,
  generateClientSecretOperation,
  getClientSecretMetadata,
  rotateClientSecret,
} from "./operation";

// GET, POST, PUT, DELETE /api/apps/{app_id}/client-secret
export const { GET, POST, PUT, DELETE } = apiRouteHandlers([
  getClientSecretMetadata,
  generateClientSecretOperation,
  rotateClientSecret,
  deleteClientSecret,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
