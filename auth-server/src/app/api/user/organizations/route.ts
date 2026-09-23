import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { listUserOrganizations } from "./operation";

// GET /api/user/organizations
export const { GET } = apiRouteHandlers([listUserOrganizations]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
