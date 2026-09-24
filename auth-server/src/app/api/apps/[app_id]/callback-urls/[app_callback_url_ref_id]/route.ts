import "server-only";
import type { ServerRuntime } from "next";
import { apiRouteHandlers } from "@/lib/api/app";
import { deleteAppCallbackUrl } from "./operation";

// DELETE /api/apps/{app_id}/callback-urls/{app_callback_url_ref_id}
export const { DELETE } = apiRouteHandlers([deleteAppCallbackUrl]);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
