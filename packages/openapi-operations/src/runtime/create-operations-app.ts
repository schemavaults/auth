import { Hono, type Context } from "hono";
import type { OpenAPIObject } from "openapi3-ts/oas31";
import type { AnyOperationDefinition, OperationHandlerContext, ResponsesDefinition } from "../operation";
import { assertUniqueOperations } from "../operation";
import { openApiPathToHonoPath } from "../openapi/path-format";
import { OPERATION_ERROR_CODES, OperationError, jsonResponse } from "./errors";
import { validateRequest } from "./validate-request";
import { assertResolversForOperations, resolveAuth, type AuthResolvers } from "./resolve-auth";

export interface OpenApiDocumentRouteOptions {
  /** Path (relative to `basePath`) serving the JSON document. Default `/openapi.json`. */
  readonly path?: string;
  readonly document: OpenAPIObject | (() => OpenAPIObject | Promise<OpenAPIObject>);
}

export interface CreateOperationsAppOptions<TContext = unknown, TUser = unknown> {
  readonly operations: readonly AnyOperationDefinition[];
  /**
   * Prefix stripped by the deployment before routing (e.g. `/api` when the
   * app is mounted from `app/api/[[...route]]/route.ts`). Operation paths
   * stay absolute in the OpenAPI document; leave unset to route on them
   * verbatim.
   */
  readonly basePath?: string;
  /** Credential resolvers keyed by auth scheme name. */
  readonly authResolvers?: AuthResolvers<TUser>;
  /** Builds the per-request context handed to handlers as `ctx.context`. */
  readonly context?: (c: Context) => Promise<TContext> | TContext;
  /** Serve the OpenAPI document from the app; omit to not expose it. */
  readonly openapi?: OpenApiDocumentRouteOptions;
  /** Called for unexpected (non-OperationError) failures before the 500 is sent. */
  readonly onError?: (error: unknown, c: Context) => void | Promise<void>;
  /** Extra middleware / routes registered before the operations (CORS, logging, ...). */
  readonly configure?: (app: Hono) => void;
}

type AnyHandlerContext = OperationHandlerContext<
  unknown,
  unknown,
  unknown,
  unknown,
  ResponsesDefinition,
  unknown,
  unknown
>;

function buildHandlerContext(
  c: Context,
  operation: AnyOperationDefinition,
  validated: { params: unknown; query: unknown; headers: unknown; body: unknown },
  auth: unknown,
  context: unknown,
): AnyHandlerContext {
  const declaredStatuses = new Set(Object.keys(operation.responses).map(Number));
  const assertDeclared = (status: number): void => {
    if (!declaredStatuses.has(status)) {
      throw new TypeError(
        `${operation.method.toUpperCase()} ${operation.path} responded with undeclared status ${status}`,
      );
    }
  };
  return {
    params: validated.params,
    query: validated.query,
    headers: validated.headers,
    body: validated.body,
    auth,
    context,
    request: c.req.raw,
    url: new URL(c.req.url),
    json(status, body, init) {
      assertDeclared(status);
      return jsonResponse(status, body, init?.headers);
    },
    empty(status, init) {
      assertDeclared(status);
      return new Response(null, { status, headers: init?.headers });
    },
    redirect(location, status = 302) {
      return new Response(null, { status, headers: { Location: location } });
    },
  };
}

/**
 * Builds a Hono app that routes, validates, authenticates and dispatches
 * the given operations. Mount it on Vercel functions with
 * `toVercelHandler()` or Next.js route handlers with `toNextRouteHandlers()`.
 */
export function createOperationsApp<TContext = unknown, TUser = unknown>(
  options: CreateOperationsAppOptions<TContext, TUser>,
): Hono {
  assertUniqueOperations(options.operations);
  const resolvers: AuthResolvers<TUser> = options.authResolvers ?? {};
  assertResolversForOperations(options.operations, resolvers);

  const root = new Hono();
  const app = options.basePath ? root.basePath(options.basePath) : root;
  options.configure?.(app);

  if (options.openapi) {
    const { document, path = "/openapi.json" } = options.openapi;
    app.get(path, async (c) => {
      const resolved = typeof document === "function" ? await document() : document;
      return c.json(resolved);
    });
  }

  for (const operation of options.operations) {
    app.on(
      operation.method.toUpperCase(),
      openApiPathToHonoPath(operation.path),
      async (c: Context): Promise<Response> => {
        try {
          const context = options.context ? await options.context(c) : (undefined as TContext);
          const auth = await resolveAuth(c, operation.auth, resolvers);
          const validated = await validateRequest(c, operation);
          const ctx = buildHandlerContext(c, operation, validated, auth, context);
          const result = await operation.handler(ctx);
          if (!(result instanceof Response)) {
            throw new TypeError(
              `${operation.method.toUpperCase()} ${operation.path} handler must return a Response (use ctx.json / ctx.empty)`,
            );
          }
          return result;
        } catch (error: unknown) {
          if (error instanceof OperationError) return error.toResponse();
          if (options.onError) {
            try {
              await options.onError(error, c);
            } catch {
              // never let error reporting mask the response
            }
          } else {
            console.error(
              `[openapi-operations] ${operation.method.toUpperCase()} ${operation.path} failed:`,
              error,
            );
          }
          return jsonResponse(500, {
            success: false,
            error: OPERATION_ERROR_CODES.internal,
            message: "Internal Server Error",
          });
        }
      },
    );
  }

  return root;
}
