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

  await using dbh = ServerlessDatabase.createDBH();

  // Validate CORS
  const corsResult = await validateCorsForClientApp(
    { client_app_id, request: req },
    dbh,
    debug,
  );

  if (!corsResult.allowed) {
    return NextResponse.json(
      { success: false, error: true, message: corsResult.error },
      { status: 403 },
    );
  }

  // Authenticate the request
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (debug) {
        console.log(
          `[/api/auth/whoami/${client_app_id}] Returning user details for '${user.email}' (uid: '${user.uid}')`,
        );
      }
      return NextResponse.json(
        { success: true, user },
        { status: 200 },
      );
    },
  );

  const response: NextResponse = await protected_route(req);

  // Apply CORS headers to response
  return await applyCorsHeadersToResponse(
    response,
    client_app_id,
    req,
    dbh,
    CORS_METHODS,
  );
}

export const dynamic = "force-dynamic";
