import GET from './GET_list_app_domains';
import POST from './POST_create_app_domain';
import { OPTIONS } from './OPTIONS_cors_handler';
import type { ServerRuntime } from "next";

export { GET, POST, OPTIONS };
export type { ListAppDomainsResponse } from './GET_list_app_domains';

export const dynamic = "force-dynamic";

export const runtime: ServerRuntime = "nodejs"
