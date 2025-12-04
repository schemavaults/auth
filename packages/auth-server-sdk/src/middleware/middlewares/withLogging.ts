import type {
  ISchemaVaultsMiddleware,
  ISchemaVaultsMiddlewareFactory,
  ISchemaVaultsMiddlewareFnInputs,
} from "@/middleware_types";
import type { NextResponse } from "next/server";
import { BaseMiddleware } from "@/middlewares/BaseMiddleware";

class RequestLoggingMiddleware
  extends BaseMiddleware
  implements ISchemaVaultsMiddleware
{
  public constructor(next: ISchemaVaultsMiddleware) {
    super({
      next,
      name: "Request Logging Middleware",
    });
  }

  public async handle({
    req,
    ...inputs
  }: ISchemaVaultsMiddlewareFnInputs): Promise<NextResponse | Response> {
    // the request may have come from behind a reverse proxy like nginx
    let ip: string | undefined = undefined;
    if (req.headers.has("X-Real-IP")) {
      ip = req.headers.get("X-Real-IP") ?? undefined;
    }

    const logIpPortion: string = ip ? `IP: "${ip}"` : "unknown IP";
    console.log(`'${req.method}' => '${req.url}' (${logIpPortion}).`);
    const next = this.next;
    if (!RequestLoggingMiddleware.hasNextMiddleware(next)) {
      throw new Error(
        "Expected RequestLoggingMiddleware to have child middleware(s)!",
      );
    }
    return await next.handle({ req, ...inputs });
  }
}

export class RequestLoggingMiddlewareFactory
  implements ISchemaVaultsMiddlewareFactory
{
  public readonly type = "middleware-factory" as const;

  public create(next: ISchemaVaultsMiddleware): ISchemaVaultsMiddleware {
    return new RequestLoggingMiddleware(next);
  }
}

export default RequestLoggingMiddlewareFactory;
