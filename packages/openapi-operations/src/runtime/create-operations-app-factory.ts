import type { Hono } from "hono";
import type { AnyOperationDefinition } from "../operation";
import { assertUniqueOperations } from "../operation";
import {
  createOperationsApp,
  type CreateOperationsAppOptions,
  type OpenApiDocumentRouteOptions,
} from "./create-operations-app";
import { assertResolversForOperations, type AuthResolvers } from "./resolve-auth";

export interface CreateOperationsAppFactoryOptions<TContext = unknown, TUser = unknown> {
  /**
   * Every operation the API exposes: the catalogue `buildOpenApiDocument()`
   * is given. Apps built by the factory may only serve operations from it,
   * so a route file cannot mount an operation the document does not list.
   */
  readonly operations: readonly AnyOperationDefinition[];
  /** Credential resolvers keyed by auth scheme name, shared by every app. */
  readonly authResolvers?: AuthResolvers<TUser>;
  /** Builds the per-request context handed to handlers as `ctx.context`. */
  readonly context?: CreateOperationsAppOptions<TContext, TUser>["context"];
  /** Called for unexpected (non-OperationError) failures before the 500 is sent. */
  readonly onError?: CreateOperationsAppOptions<TContext, TUser>["onError"];
}

/** Per-app options a factory caller may still set. */
export type OperationsAppFactoryAppOptions<TContext = unknown, TUser = unknown> = Pick<
  CreateOperationsAppOptions<TContext, TUser>,
  "basePath" | "configure" | "openapi"
>;

export interface OperationsAppFactory<TContext = unknown, TUser = unknown> {
  /** The full catalogue the factory was created with. */
  readonly operations: readonly AnyOperationDefinition[];
  /** The shared resolvers every app built by the factory authenticates with. */
  readonly authResolvers: AuthResolvers<TUser>;
  /**
   * Builds a Hono app serving the given operations (default: the whole
   * catalogue) with the shared resolvers / context / error reporting.
   * Throws when an operation is not part of the catalogue.
   */
  app(
    operations?: readonly AnyOperationDefinition[],
    options?: OperationsAppFactoryAppOptions<TContext, TUser>,
  ): Hono;
  /** Builds a Hono app that only serves the OpenAPI document. */
  openApiDocumentApp(
    openapi: OpenApiDocumentRouteOptions,
    options?: Omit<OperationsAppFactoryAppOptions<TContext, TUser>, "openapi">,
  ): Hono;
  /** Throws unless every given operation is part of the catalogue. */
  assertRegistered(operations: readonly AnyOperationDefinition[]): void;
}

/**
 * Binds the shared runtime configuration (auth resolvers, per-request
 * context, error reporting) and the full operation catalogue once, so many
 * small apps can be built from it: one per Next.js `route.ts` / Vercel
 * function file, each serving only the operation(s) at its path, while a
 * single OpenAPI document generated from the same catalogue still describes
 * all of them.
 *
 * ```ts
 * // src/lib/api/app.ts
 * export const api = createOperationsAppFactory<Ctx, UserData>({
 *   operations, // the same list buildOpenApiDocument() is given
 *   authResolvers,
 *   context: () => ({ ... }),
 * });
 *
 * // app/api/health/route.ts
 * export const { GET } = toNextRouteHandlers(api.app([health]), operationHttpMethods([health]));
 *
 * // app/api/openapi.json/route.ts
 * export const { GET } = toNextRouteHandlers(
 *   api.openApiDocumentApp({ path: "/api/openapi.json", document }),
 *   ["get"],
 * );
 * ```
 *
 * Every app validates against the whole catalogue up front: duplicate
 * operations or a scheme without a resolver fail at module load of the
 * first route rather than when the affected route is first hit.
 */
export function createOperationsAppFactory<TContext = unknown, TUser = unknown>(
  options: CreateOperationsAppFactoryOptions<TContext, TUser>,
): OperationsAppFactory<TContext, TUser> {
  const catalogue: readonly AnyOperationDefinition[] = Object.freeze([...options.operations]);
  assertUniqueOperations(catalogue);
  const resolvers: AuthResolvers<TUser> = options.authResolvers ?? {};
  assertResolversForOperations(catalogue, resolvers);
  const registered = new Set<AnyOperationDefinition>(catalogue);

  const assertRegistered = (operations: readonly AnyOperationDefinition[]): void => {
    for (const operation of operations) {
      if (!registered.has(operation)) {
        throw new TypeError(
          `${operation.method.toUpperCase()} ${operation.path} (${operation.operationId}) is not part of the operations catalogue this factory was created with, so it would be served without appearing in the OpenAPI document`,
        );
      }
    }
  };

  const app: OperationsAppFactory<TContext, TUser>["app"] = (
    operations = catalogue,
    appOptions = {},
  ) => {
    assertRegistered(operations);
    return createOperationsApp<TContext, TUser>({
      operations,
      authResolvers: resolvers,
      context: options.context,
      onError: options.onError,
      basePath: appOptions.basePath,
      configure: appOptions.configure,
      openapi: appOptions.openapi,
    });
  };

  return {
    operations: catalogue,
    authResolvers: resolvers,
    app,
    openApiDocumentApp: (openapi, appOptions = {}) => app([], { ...appOptions, openapi }),
    assertRegistered,
  };
}
