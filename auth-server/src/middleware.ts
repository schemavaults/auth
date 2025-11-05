import "server-only";

import {
  type NextFetchEvent,
  type NextRequest,
  type NextMiddleware,
  NextResponse,
} from "next/server";
import { SchemaVaultsServerMiddleware } from "@schemavaults/auth-server-sdk";
import type { AuthenticateResult } from "@schemavaults/auth";
import {
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import loadAuthServerMiddlewareRules from "@/lib/auth-server-middleware-rules";

const SchemaVaultsAuthServerMiddleware = async (
  req: NextRequest,
  event: NextFetchEvent,
) => {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  const debug: boolean = shouldEnableDebug(environment);

  let middleware: SchemaVaultsServerMiddleware;
  try {
    middleware = new SchemaVaultsServerMiddleware({
      api_server_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      auth_middleware_rules: loadAuthServerMiddlewareRules(),
      environment,
      debug,
    });
  } catch (e: unknown) {
    console.error(
      "[@schemavaults/auth-server | middleware.ts] Failed to initialize SchemaVaults middleware: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to initialize SchemaVaults middleware!",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  try {
    const middleware_result = await middleware.handle({
      req,
      event,
      next: () => NextResponse.next(),
      json: NextResponse.json,
      redirect: NextResponse.redirect,
      rewrite: NextResponse.rewrite,
    });
    return middleware_result;
  } catch (e: unknown) {
    console.error(
      "[@schemavaults/auth-server | middleware.ts] Failed to run SchemaVaults middleware: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to run SchemaVaults middleware!",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }
};

export default SchemaVaultsAuthServerMiddleware satisfies NextMiddleware;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icon.png (favicon file)
     * - manifest.json (manifest file)
     * - media (media files)
     * - api/environment (allow client to know what schemavaults app environment is running)
     */
    "/((?!_next/static|_next/image|icon.png|favicon.ico|manifest.json|media|api/environment).*)",
  ],
};
