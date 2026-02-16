import "server-only";
import type { ServerRuntime } from "next";
import GET from './GET_check_app_authorization';

export { GET };
export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "edge"
