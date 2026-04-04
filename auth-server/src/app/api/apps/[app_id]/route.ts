import "server-only";
import { GET_app_handler as GET } from "./GET_app_handler";
import { DELETE_app_handler as DELETE } from "./DELETE_app_handler";
import { OPTIONS } from "./OPTIONS_cors_handler";
import type { ServerRuntime } from "next";

export { GET, DELETE, OPTIONS };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
