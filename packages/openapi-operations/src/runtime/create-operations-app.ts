import { Hono, type Context } from "hono";
import type { OpenAPIObject } from "openapi3-ts/oas31";
import type { AnyOperationDefinition, OperationHandlerContext, ResponsesDefinition } from "../operation";
import { assertUniqueOperations } from "../operation";
import { openApiPathToHonoPath } from "../openapi/path-format";
import { OPERATION_ERROR_CODES, isOperationError, jsonResponse } from "./errors";
import { validateRequest } from "./validate-request";
import { assertResolversForOperations, resolveAuth, type AuthResolvers } from "./resolve-auth";

export interface OpenApiDocumentRouteOptions {
  /** Path (relative to `basePath`) serving the JSON document. Default `/openapi.json`. */
  readonly path?: string;
  /**
   * The document, or a function producing it per request. The function
   * receives the Hono context so hosts can derive request-dependent parts
   * such as `servers` from the incoming Host / X-Forwarded-* headers.
   */
  readonly document:
    | OpenAPIObject
    | ((c: Context) => OpenAPIObject | Promise<OpenAPIObject>);
}

/** What `onError` learns about the failed request besides the error itself. */
export interface OperationFailureInfo<TContext = unknown> {
  readonly operation: AnyOperationDefinition;
  /** The per-request context, when it had been built before the failure. */
  readonly context: TContext | undefined;
}

export interface CreateOperationsAppOptions<TContext = unknown, TUser = unknown> {
  readonly operations: readonly AnyOperationDefinition[];
  /**
   * Prefix stripped by the deployment before routing (e.g. `/api` when the
   * app is mounted from `app/api/[[...route]]/route.ts`). Operation paths
   * stay absolute in the OpenAPI document; leave unset to route on them
   * verbatim (Next.js route handlers and Vercel functions receive the full
   * request URL, so they never need it).
   */
  readonly basePath?: string;
  /** Credential resolvers keyed by auth scheme name. */
  readonly authResolvers?: AuthResolvers<TUser, TContext>;
  /**
   * Builds the per-request context handed to auth resolvers and to handlers
   * as `ctx.context`. Built before credentials are resolved, so it should
   * be cheap (open expensive resources lazily) and is released through
   * `disposeContext` once the response has been produced.
   */
  readonly context?: (c: Context) => Promise<TContext> | TContext;
  /**
   * Releases the per-request context (database handles, cache connections)
   * after the handler returned or failed. Errors thrown here are reported
   * to `onError` (or the console) and never change the response.
   */
  readonly disposeContext?: (context: TContext, c: Context) => void | Promise<void>;
  /** Serve the OpenAPI document from the app; omit to not expose it. */
  readonly openapi?: OpenApiDocumentRouteOptions;
  /** Called for unexpected (non-OperationError) failures before the 500 is sent. */
  readonly onError?: (
    error: unknown,
    c: Context,
    info: OperationFailureInfo<TContext>,
  ) => void | Promise<void>;
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
  const resolvers: AuthResolvers<TUser, TContext> = options.authResolvers ?? {};
  assertResolversForOperations(options.operations, resolvers);

  const root = new Hono();
  const app = options.basePath ? root.basePath(options.basePath) : root;
  options.configure?.(app);

  if (options.openapi) {
    const { document, path = "/openapi.json" } = options.openapi;
    app.get(path, async (c) => {
      const resolved = typeof document === "function" ? await document(c) : document;
      return c.json(resolved);
    });
  }

  const report = async (
    error: unknown,
    c: Context,
    info: OperationFailureInfo<TContext>,
  ): Promise<void> => {
    if (options.onError) {
      try {
        await options.onError(error, c, info);
      } catch {
        // never let error reporting mask the response
      }
    } else {
      console.error(
        `[openapi-operations] ${info.operation.method.toUpperCase()} ${info.operation.path} failed:`,
        error,
      );
    }
  };

  for (const operation of options.operations) {
    app.on(
      operation.method.toUpperCase(),
      openApiPathToHonoPath(operation.path),
      async (c: Context): Promise<Response> => {
        let context: TContext | undefined = undefined;
        let built = false;
        try {
          if (options.context) {
            context = await options.context(c);
            built = true;
          }
          const auth = await resolveAuth(c, operation.auth, resolvers, context as TContext);
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
          if (isOperationError(error)) return error.toResponse();
          await report(error, c, { operation, context });
          return jsonResponse(500, {
            success: false,
            error: OPERATION_ERROR_CODES.internal,
            message: "Internal Server Error",
          });
        } finally {
          if (built && options.disposeContext) {
            try {
              await options.disposeContext(context as TContext, c);
            } catch (error: unknown) {
              await report(error, c, { operation, context });
            }
          }
        }
      },
    );
  }

  return root;
}
