import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { createOrganizationOperation, listAllOrganizations } from "./operation";

// GET, POST /api/organizations
export const { GET, POST } = apiRouteHandlers([listAllOrganizations, createOrganizationOperation]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
