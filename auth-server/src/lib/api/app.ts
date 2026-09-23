import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import {
  createOperationsApp,
  openApiPathToHonoPath,
  operationHttpMethods,
  toNextRouteHandlers,
  type AnyOperationDefinition,
  type Hono,
  type HonoContext,
  type HttpMethod,
  type NextRouteHandlers,
  type OperationFailureInfo,
} from "@schemavaults/openapi-operations";
import captureServerException from "@/lib/captureServerException";
import { authResolvers } from "./auth-resolvers";
import type { AuthServerApiContext } from "./context";
import { AuthServerRequestContext } from "./request-context";

/** Handler for a CORS preflight (`OPTIONS`) of the route's path(s). */
export type PreflightHandler = (
  request: Request,
  params: Readonly<Record<string, string>>,
) => Response | Promise<Response>;

export interface ApiRouteOptions {
  /**
   * Answers `OPTIONS` for every path the route serves (CORS preflights).
   * Not an operation, so it stays out of the OpenAPI document; the route
   * file's `OPTIONS` export is added automatically.
   */
  readonly preflight?: PreflightHandler;
  /**
   * Extra Hono middleware / routes registered before the operations, e.g.
   * `app.use(path, async (c, next) => { await next(); decorate(c.res); })`
   * for endpoints that must add per-client-app CORS headers to every
   * response, including the runtime's own 401/403s.
   */
  readonly configure?: (app: Hono) => void;
  /**
   * Extra request paths served by this route's operations, keyed by alias
   * → operation path. Needed when `next.config.ts` rewrites a public path
   * onto the route (e.g. `/.well-known/openid-configuration` →
   * `/api/oidc/openid-configuration`): the route handler still receives the
   * ORIGINAL request URL, which the Hono app would otherwise not match. The
   * alias is dispatched to the operation path with the same method, headers
   * and body; aliases never appear in the OpenAPI document.
   */
  readonly aliases?: Readonly<Record<string, string>>;
}

async function reportFailure(
  error: unknown,
  _c: HonoContext,
  info: OperationFailureInfo<AuthServerApiContext>,
): Promise<void> {
  const { operation, context } = info;
  console.error(
    `[api] ${operation.method.toUpperCase()} ${operation.path} (${operation.operationId}) failed:`,
    error,
  );
  const db = context?.db;
  if (!db) return;
  await captureServerException(db, error, {
    op_name: operation.operationId,
    route: operation.path,
  });
}

/**
 * Builds the Hono app serving `operations` with the auth server's shared
 * runtime: the credential resolvers, a per-request context whose database
 * / Redis handles open lazily and are released after the response, and
 * exception capture to the ERRORS table for unexpected failures.
 */
export function createApiApp(
  operations: readonly AnyOperationDefinition[],
  options: ApiRouteOptions = {},
): Hono {
  return createOperationsApp<AuthServerApiContext, UserData>({
    operations,
    authResolvers,
    context: () => new AuthServerRequestContext(),
    disposeContext: (context) => (context as AuthServerRequestContext).dispose(),
    onError: reportFailure,
    configure: (app) => {
      options.configure?.(app);
      for (const [alias, target] of Object.entries(options.aliases ?? {})) {
        if (!operations.some((operation) => operation.path === target)) {
          throw new TypeError(`Alias ${alias} points at ${target}, which this route does not serve`);
        }
        app.all(alias, (c) => {
          const url = new URL(c.req.url);
          url.pathname = target;
          return app.fetch(new Request(url, c.req.raw));
        });
      }
      const preflight = options.preflight;
      if (!preflight) return;
      for (const path of new Set(operations.map((operation) => operation.path))) {
        app.options(openApiPathToHonoPath(path), (c) => preflight(c.req.raw, c.req.param()));
      }
    },
  });
}

/**
 * Next.js route handler exports for one `route.ts`: a small Hono app
 * serving only the operation(s) declared beside the route file. Only the
 * HTTP methods the operations declare (plus `OPTIONS` when a preflight
 * handler is given) are exported, so Next.js answers 405 for the rest.
 *
 * ```ts
 * // src/app/api/apps/[app_id]/route.ts
 * export const { GET, DELETE } = apiRouteHandlers([getApp, deleteApp]);
 * ```
 *
 * The catalogue in ./operations (which drives GET /api/openapi.json and the
 * /docs pages) is deliberately NOT imported here: route bundles stay small
 * and cold starts cheap. `./routes.test.ts` checks instead that every
 * route file's operations are catalogued and vice versa.
 */
export function apiRouteHandlers(
  operations: readonly AnyOperationDefinition[],
  options: ApiRouteOptions = {},
): NextRouteHandlers {
  const methods: HttpMethod[] = operationHttpMethods(operations);
  if (options.preflight && !methods.includes("options")) methods.push("options");
  return toNextRouteHandlers(createApiApp(operations, options), methods);
}
