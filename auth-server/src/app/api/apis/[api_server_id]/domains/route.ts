import "server-only";
import GET from './GET_list_api_server_domains';
import POST from './POST_create_api_server_domain';
import type { ServerRuntime } from "next";

export { GET, POST };
export type { ListApiServerDomainsResponse } from './GET_list_api_server_domains';

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
