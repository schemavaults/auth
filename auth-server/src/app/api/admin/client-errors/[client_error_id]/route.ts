import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteClientError, getClientError } from "./operation";

// GET, DELETE /api/admin/client-errors/{client_error_id}
export const { GET, DELETE } = apiRouteHandlers([getClientError, deleteClientError]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
