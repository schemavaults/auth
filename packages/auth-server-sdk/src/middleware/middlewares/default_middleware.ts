import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import { BaseMiddleware } from "@/middlewares/BaseMiddleware";

export class DefaultMiddleware
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{
  public constructor(next?: ISchemaVaultsMiddleware) {
    super({
      next,
      name: "Passthrough",
    });
  }

  public async handle(inputs: ISchemaVaultsMiddlewareFnInputs) {
    if (this.environment === "development") {
      console.log(
        "[DefaultMiddleware] Forwarding to endpoint or next middleware...",
      );
    }
    if (this.next) {
      return this.next.handle(inputs);
    }
    return inputs.next();
  }
}

export class DefaultMiddlewareFactory
  implements ISchemaVaultsMiddlewareFactory
{
  public readonly type = "middleware-factory" as const;

  public create(next: ISchemaVaultsMiddleware): ISchemaVaultsMiddleware {
    return new DefaultMiddleware(next);
  }
}
