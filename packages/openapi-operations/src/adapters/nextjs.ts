import type { Hono } from "hono";
import { handle } from "hono/vercel";
import { HTTP_METHODS, type HttpMethod } from "../http-method";

export type NextRouteHandler = (request: Request) => Response | Promise<Response>;

export type NextRouteHandlers<TMethods extends HttpMethod = HttpMethod> = {
  readonly [M in TMethods as Uppercase<M>]: NextRouteHandler;
};

/**
 * Next.js App Router route-handler exports for the operations app. Typical
 * usage from a catch-all route so one Hono app serves every operation:
 *
 * ```ts
 * // app/api/[[...route]]/route.ts
 * export const runtime = "nodejs";
 * export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = toNextRouteHandlers(app);
 * ```
 *
 * Pass `methods` to only export a subset (e.g. when a route file coexists
 * with hand-written handlers for other methods).
 */
export function toNextRouteHandlers<const TMethods extends readonly HttpMethod[] = typeof HTTP_METHODS>(
  app: Hono,
  methods: TMethods = HTTP_METHODS as unknown as TMethods,
): NextRouteHandlers<TMethods[number]> {
  const handler = handle(app);
  const handlers: Record<string, NextRouteHandler> = {};
  for (const method of methods) {
    handlers[method.toUpperCase()] = handler;
  }
  return handlers as NextRouteHandlers<TMethods[number]>;
}
