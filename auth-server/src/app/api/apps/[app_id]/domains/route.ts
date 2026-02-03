import GET from './GET_list_app_domains';
import POST from './POST_create_app_domain';
import type { ServerRuntime } from "next";

export { GET, POST };
export type { ListAppDomainsResponse } from './GET_list_app_domains';

export const dynamic = "force-dynamic";

export const runtime: ServerRuntime = "edge"
