import type { Hono } from "hono";
import { handle } from "hono/vercel";

export type VercelFunctionHandler = (request: Request) => Response | Promise<Response>;

/**
 * Wraps the operations app as a Vercel (Fluid / Node.js / Edge) function
 * handler using Hono's Vercel adapter. Export it from a `api/*.ts` function
 * file or a Next.js route handler:
 *
 * ```ts
 * // api/[[...route]].ts
 * export default toVercelHandler(app);
 * ```
 */
export function toVercelHandler(app: Hono): VercelFunctionHandler {
  return handle(app);
}
