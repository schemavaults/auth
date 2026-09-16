import "server-only";
import { headers } from "next/headers";
import { resolvePublicOrigin } from "./public-origin";

/**
 * `resolvePublicOrigin` for server components / route handlers rendered by
 * Next.js: reads the incoming request's headers via `next/headers`. Only
 * valid inside a request scope (never during `generateStaticParams`).
 */
export async function resolvePublicOriginFromRequest(): Promise<string> {
  const requestHeaders = await headers();
  return resolvePublicOrigin((name) => requestHeaders.get(name));
}
