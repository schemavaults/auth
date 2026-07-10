import "server-only";
export { default as POST } from './POST_api_creation_handler'
export { default as GET } from "./GET_api_list_handler"
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "nodejs"
export const dynamic = "force-dynamic"; // defaults to auto
