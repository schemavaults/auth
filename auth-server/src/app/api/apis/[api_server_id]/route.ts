import "server-only";
import { GET_api_server_handler as GET } from "./GET_api_server_handler";
import { DELETE_api_server_handler as DELETE } from "./DELETE_api_server_handler";
import type { ServerRuntime } from "next";

export { GET, DELETE };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
