import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import {
  getAppDeviceAuthorizationPolicyOperation,
  setAppDeviceAuthorizationPolicyOperation,
} from "./operation";

// GET, PUT /api/apps/{app_id}/device-authorization
export const { GET, PUT } = apiRouteHandlers([
  getAppDeviceAuthorizationPolicyOperation,
  setAppDeviceAuthorizationPolicyOperation,
]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
