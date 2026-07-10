import "server-only";
import type { ServerRuntime } from "next";

export { GET } from "./GET_allowed_origins_for_api_server";
export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
