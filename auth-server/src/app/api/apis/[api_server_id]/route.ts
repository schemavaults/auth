import "server-only";
import { GET_api_server_handler as GET } from "./GET_api_server_handler";
import { OPTIONS } from "./OPTIONS_cors_handler";
import type { ServerRuntime } from "next";

export { GET, OPTIONS };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "edge";
