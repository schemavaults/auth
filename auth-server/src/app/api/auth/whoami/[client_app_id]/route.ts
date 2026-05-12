import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import {
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { ServerlessDatabase } from "@/lib/auth-db";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  handleCorsPreflightForClientApp,
  validateCorsForClientApp,
  applyCorsHeadersToResponse,
} from "@/lib/cors/cors-for-client-app";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { userDataSchema } from "@schemavaults/auth-common";

const CORS_METHODS = "GET, OPTIONS";

/**
 * Handle CORS preflight requests for the whoami endpoint
 */
export async function OPTIONS(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/whoami/[client_app_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;
  if (!appIdSchema.safeParse(params.client_app_id).success) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 },
    );
  }
  await using dbh = ServerlessDatabase.createDBH();
  return handleCorsPreflightForClientApp(
    params.client_app_id as AppId,
    req,
    dbh,
    CORS_METHODS,
  );
}

/**
 * Return the currently authenticated user's details.
 *
 * Requires a valid access token cookie for the auth server.
 * Supports CORS for cross-origin requests from registered client app domains.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/whoami/[client_app_id]">,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const params = await ctx.params;
  const client_app_id = params.client_app_id as AppId;

  if (debug) {
    console.log(`${req.method} => /api/auth/whoami/${client_app_id}`);
  }

  if (!appIdSchema.safeParse(client_app_id).success) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 },
    );
  }

  // Validate CORS up front so that auth-failure responses (401/403 from the
  // route guard) still carry Access-Control-Allow-Origin headers. Without this,
  // unauthenticated cross-origin probes from registered client apps surface as
  // a CORS error in the browser instead of a parseable 401, which breaks
  // useStartLoginOauthPKCEFlow's "am I already logged in?" check.
  await using dbh = ServerlessDatabase.createDBH();
  const corsResult = await validateCorsForClientApp(
    { client_app_id, request: req },
    dbh,
    debug,
  );

  if (!corsResult.allowed) {
    if (debug) {
      console.warn("Request blocked with CORS error: ", corsResult);
    }
    return NextResponse.json(
      { success: false, error: true, message: corsResult.error },
      { status: 403 },
    );
  }

  const protected_route: (req: NextRequest) => Promise<NextResponse> = await withAuthenticatedApiRouteGuard(
    async ({
      user,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      // Validate that user object contains only UserData fields.
      // userDataSchema is .strict(), so this returns an error if JWT-internal fields leaked through.
      const parseResult = await userDataSchema.safeParseAsync(user);

      if (!parseResult.success) {
        console.error(
          `[/api/auth/whoami/${client_app_id}] User object failed validation:`,
          parseResult.error,
        );
        return NextResponse.json(
          { success: false, error: true, message: "Internal server error" },
          { status: 500 },
        );
      }

      const validatedUser = parseResult.data;

      if (debug) {
        console.log(
          `[/api/auth/whoami/${client_app_id}] Returning user details for '${validatedUser.email}' (uid: '${validatedUser.uid}')`,
        );
      }

      return NextResponse.json(
        { success: true, user: validatedUser },
        { status: 200 },
      );
    },
  );

  const response = await protected_route(req);

  return await applyCorsHeadersToResponse(
    response,
    client_app_id,
    req,
    dbh,
    CORS_METHODS,
  );
}

export const dynamic = "force-dynamic";
