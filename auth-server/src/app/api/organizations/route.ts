import "server-only";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "nodejs"
export const dynamic = "force-dynamic"; // defaults to auto

export { POST } from "./POST_create_handler";
export { GET } from './GET_list_organizations_handler';
