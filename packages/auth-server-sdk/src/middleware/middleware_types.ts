import type { NextFetchEvent, NextRequest, NextResponse } from "next/server";

export interface ISchemaVaultsMiddlewareFnInputs {
  req: NextRequest;
  // Pass to endpoint, from middleware
  next: () => NextResponse;
  // Helpers for middleware handling.
  event: NextFetchEvent;
  // Create a json response instance
  json: typeof NextResponse.json;
  // Create a redirect response instance
  redirect: typeof NextResponse.redirect;
  // Create a rewrite response instance
  rewrite: typeof NextResponse.rewrite;
}

export type SchemaVaultsMiddlewareHandlerFn = (
  middlewareInputs: ISchemaVaultsMiddlewareFnInputs,
) => Promise<NextResponse | Response>;

export interface ISchemaVaultsMiddleware {
  // Handler function
  handle: SchemaVaultsMiddlewareHandlerFn;

  // Identifies this middleware (as one step in a middleware chain, with potentially several middlewares)
  name: string;

  // Height above the actual endpoint handler. e.g. 0 = last middleware before passing request to endpoint. 1 = this middleware runs, then one at height0, then passes to endpoint
  height: number;

  type: "middleware";

  toMiddlewareFlowString: () => string;
}

export interface ISchemaVaultsMiddlewareFactory {
  create: (next: ISchemaVaultsMiddleware) => ISchemaVaultsMiddleware;

  type: "middleware-factory";
}
