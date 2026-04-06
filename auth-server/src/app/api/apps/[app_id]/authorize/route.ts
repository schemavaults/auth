import "server-only";
import type { ServerRuntime } from "next";
import POST from './POST_authorize_client_application';

export { POST };
export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs"
