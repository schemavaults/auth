import "server-only";
import {
  getAppEnvironment,
  getSchemavaultsApiServerId,
  type UserData,
} from "@schemavaults/auth-server-sdk";
import {
  createOperationsAppFactory,
  operationHttpMethods,
  toNextRouteHandlers,
  type AnyOperationDefinition,
  type NextRouteHandlers,
  type OperationsAppFactory,
} from "@schemavaults/openapi-operations";
import type { ExampleApiContext } from "./context";
import { operations } from "./operations";
import { authResolvers } from "./auth-resolvers";

/**
 * Shared runtime for every `src/app/api/**\/route.ts`: the credential
 * resolvers, the per-request context, and the full operation catalogue the
 * OpenAPI document is generated from. Each route file builds its own small
 * Hono app from it (serving just the operation declared beside the route)
 * instead of one catch-all app serving everything, while
 * GET /api/openapi.json (src/app/api/openapi.json/route.ts) still describes
 * all of them.
 */
export const api: OperationsAppFactory<ExampleApiContext, UserData> =
  createOperationsAppFactory<ExampleApiContext, UserData>({
    operations,
    authResolvers,
    context: () => ({
      environment: getAppEnvironment(),
      api_server_id: getSchemavaultsApiServerId(),
    }),
  });

/**
 * Next.js route handler exports for one route file. Only the HTTP methods
 * the given operations declare are exported, so Next.js answers 405 for
 * the others itself. Throws at module load when an operation is not in the
 * catalogue (i.e. would be served but not documented).
 *
 * ```ts
 * // src/app/api/health/route.ts
 * export const { GET } = apiRouteHandlers(health);
 * ```
 */
export function apiRouteHandlers(
  ...routeOperations: readonly AnyOperationDefinition[]
): NextRouteHandlers {
  return toNextRouteHandlers(api.app(routeOperations), operationHttpMethods(routeOperations));
}
