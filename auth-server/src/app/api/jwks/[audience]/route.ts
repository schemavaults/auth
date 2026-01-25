import "server-only";
import type { ServerRuntime } from "next";

export { GET } from './GET_load_audience_jwks';
export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
