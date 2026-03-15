import "server-only";
import POST from './POST_create_api_server_domain';
import { OPTIONS } from './OPTIONS_cors_handler';
import type { ServerRuntime } from "next";

export { POST, OPTIONS };

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "edge";
