import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listUserOrganizationsForResourceServer } from "./operation";

// GET /api/resource-server/users/{uid}/organizations
export const { GET } = apiRouteHandlers([listUserOrganizationsForResourceServer]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
