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
import {
  type PotentiallyValidTokenSource,
  userDataSchema,
} from "@schemavaults/auth-common";
import { RefreshTokenCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";

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

  // The auth guard normally only honors the auth server's own session cookie
  // (refresh_token_schemavaults-auth). Callers of this endpoint may instead
  // only hold the per-client-app refresh token cookie (refresh_token_<client_app_id>)
  // issued during the OAuth2 grant flow, so promote it into the guard's token
  // sources here.
  const additional_token_sources: PotentiallyValidTokenSource[] = [];
  const client_app_refresh_cookie = req.cookies.get(
    RefreshTokenCookieName(client_app_id),
  );
  if (
    typeof client_app_refresh_cookie?.value === "string" &&
    client_app_refresh_cookie.value.length > 64 &&
    getStringByteSize(client_app_refresh_cookie.value) <=
      MaximumBrowserCookieSize
  ) {
    additional_token_sources.push({
      sourceHint: `Client App Refresh Token from cookie '${RefreshTokenCookieName(client_app_id)}'`,
      type: "refresh",
      token: client_app_refresh_cookie.value,
    });
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
    { additional_token_sources },
  );

  // Run the auth guard first so unauthenticated callers always see 401 —
  // regardless of whether the supplied client_app_id or Origin would have
  // been accepted. This prevents unauthenticated probing of which apps /
  // origins are registered, and keeps the "401 must beat input validation"
  // invariant the rest of the API follows.
  const guardResponse = await protected_route(req);

  await using dbh = ServerlessDatabase.createDBH();
  const corsResult = await validateCorsForClientApp(
    { client_app_id, request: req },
    dbh,
    debug,
  );

  // For authenticated success responses, enforce CORS strictly: an
  // authenticated session must not be able to read another app's user data
  // from a foreign origin.
  if (guardResponse.status === 200 && !corsResult.allowed) {
    if (debug) {
      console.warn("Request blocked with CORS error: ", corsResult);
    }
    return NextResponse.json(
      { success: false, error: true, message: corsResult.error },
      { status: 403 },
    );
  }

  // Apply CORS headers to whatever the guard returned (200 or 401/403). This
  // is the regression fix: cross-origin probes from registered client apps
  // now receive a 401 with Access-Control-Allow-Origin attached, so the
  // browser surfaces it as a parseable response instead of a CORS error.
  // When the origin isn't registered, applyCorsHeadersToResponse is a no-op
  // and the bare auth-failure response is returned as-is.
  return await applyCorsHeadersToResponse(
    guardResponse,
    client_app_id,
    req,
    dbh,
    CORS_METHODS,
  );
}

export const dynamic = "force-dynamic";
