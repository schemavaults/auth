import "server-only";
import type { ServerRuntime } from "next";
import POST from "./POST_generate_authorization_code";

export { POST };
export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";
