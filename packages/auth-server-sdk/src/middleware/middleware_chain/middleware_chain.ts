import type { NextResponse } from "next/server";
import { DefaultMiddleware } from "@/middlewares/default_middleware";
import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { BaseMiddleware } from "@/middlewares/BaseMiddleware";

export interface IMiddlewareChainInitOptions {
  middlewares: readonly ISchemaVaultsMiddlewareFactory[];
  debug?: boolean;
}

export class MiddlewareChain
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{
  public constructor(opts: IMiddlewareChainInitOptions) {
    super({
      ...opts,
      name: "MiddlewareChain",
      next: MiddlewareChain.combine(opts.middlewares),
    });
  }

  private static stackMiddlewares(
    middleware_factories: readonly ISchemaVaultsMiddlewareFactory[],
    index = 0,
  ): ISchemaVaultsMiddleware {
    const current: ISchemaVaultsMiddlewareFactory = middleware_factories[index];
    if (current) {
      const next: ISchemaVaultsMiddleware = MiddlewareChain.stackMiddlewares(
        middleware_factories,
        index + 1,
      );
      try {
        return current.create(next);
      } catch (e: unknown) {
        console.error(
          `[MiddlewareChain] Error in middleware chain at index ${index}: `,
          e,
        );
        throw new Error("[MiddlewareChain] Error in middleware chain");
      }
    }
    return new DefaultMiddleware();
  }

  private static combine(
    functions: readonly ISchemaVaultsMiddlewareFactory[],
  ): ISchemaVaultsMiddleware {
    return MiddlewareChain.stackMiddlewares(functions, 0);
  }

  public async handle({
    req,
    json,
    ...inputs
  }: ISchemaVaultsMiddlewareFnInputs): Promise<NextResponse | Response> {
    if (this.debug) {
      console.log("[MiddlewareChain] handle()");
    }
    const chained: ISchemaVaultsMiddleware | undefined = this.next;
    if (
      !chained ||
      typeof chained !== "object" ||
      chained.type !== "middleware"
    ) {
      throw new Error(
        "Expected 'chained' to be a SchemaVaultsMiddleware instance",
      );
    }
    const next: ISchemaVaultsMiddleware = chained;
    try {
      return await next.handle({ req, json, ...inputs });
    } catch (e: unknown) {
      console.error("[MiddlewareChain] failed to execute chain: ", e);
      return json(
        {
          kind: "failure",
          success: false,
          message:
            "An unhandled error occurred while running SchemaVaults server middleware!",
        } satisfies AuthenticateResult,
        {
          status: 500,
        },
      );
    }
  }
} // end of MiddlewareChain
