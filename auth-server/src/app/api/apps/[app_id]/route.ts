import "server-only";
import { GET_app_handler as GET } from "./GET_app_handler";
import type { ServerRuntime } from "next";

export { GET };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "edge";
