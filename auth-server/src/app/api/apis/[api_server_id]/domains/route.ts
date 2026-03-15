import "server-only";
import GET from './GET_list_api_server_domains';
import POST from './POST_create_api_server_domain';
import { OPTIONS } from './OPTIONS_cors_handler';
import type { ServerRuntime } from "next";

export { GET, POST, OPTIONS };
export type { ListApiServerDomainsResponse } from './GET_list_api_server_domains';

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "edge";
