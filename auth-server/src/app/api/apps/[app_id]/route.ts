import "server-only";
import { GET_app_handler as GET } from "./GET_app_handler";
import { DELETE_app_handler as DELETE } from "./DELETE_app_handler";
import type { ServerRuntime } from "next";

export { GET, DELETE };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
