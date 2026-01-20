import "server-only";
export { POST } from "./POST_app_creation_handler";
export { GET_app_list_handler as GET } from "./GET_app_list_handler";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge"
