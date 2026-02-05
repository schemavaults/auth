import "server-only";
import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import getHostname from "@/lib/hostname";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  ServerlessDatabase,
  SchemaVaultsAppRegistry,
} from "@/lib/auth-db";
import {
  getOriginFromRequest,
  getAppAllowedOriginsForEnvironment,
  isOriginAllowedForClientApp,
  buildCorsHeaders,
} from "@/lib/cors/cors-for-client-app";

/**
 * Handle CORS preflight requests for the logout endpoint
 */
export async function OPTIONS(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/logout/[client_app_id]">
): Promise<NextResponse> {
  const params = await ctx.params;
  if (
    !("client_app_id" in params) ||
    !params.client_app_id ||
    !appIdSchema.safeParse(params.client_app_id).success
  ) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 }
    );
  }

  const client_app_id: AppId = params.client_app_id;
  const origin: string | null = getOriginFromRequest(req);

  // No origin header = not a browser CORS request, allow it
  if (!origin) {
    return new NextResponse(null, { status: 204 });
  }

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  await using dbh = ServerlessDatabase.createDBH();

  // Check if app exists
  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const app = await appRegistry.getApp(client_app_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: true, message: "App not found" },
      { status: 404 }
    );
  }

  // Validate origin against allowed domains
  const allowedOrigins: readonly string[] = await getAppAllowedOriginsForEnvironment(
    client_app_id,
    environment,
    dbh
  );

  if (!isOriginAllowedForClientApp(origin, allowedOrigins)) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: `Origin '${origin}' is not allowed for app '${client_app_id}'`,
      },
      { status: 403 }
    );
  }

  // Return 204 with CORS headers
  const corsHeaders = buildCorsHeaders(origin);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/logout/[client_app_id]">
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const params = await ctx.params;
  if (
    !("client_app_id" in params) ||
    !params.client_app_id ||
    !appIdSchema.safeParse(params.client_app_id).success
  ) {
    return NextResponse.json(
      {
        message: "Missing 'client_app_id' in logout request!",
        success: false,
        error: true,
      },
      { status: 400 }
    );
  }
  const client_app_id: AppId = params.client_app_id;

  if (debug) {
    console.log(`${req.method} => /api/auth/logout/${client_app_id}`);
  }

  const origin = getOriginFromRequest(req);

  await using dbh = ServerlessDatabase.createDBH();

  // Check if app exists
  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const app = await appRegistry.getApp(client_app_id);
  if (!app) {
    return NextResponse.json(
      {
        message: "App not found",
        success: false,
        error: true,
      },
      { status: 404 }
    );
  }

  // Web apps must have Origin header
  if (app.web && !origin) {
    return NextResponse.json(
      {
        message: "Web apps must include Origin header",
        success: false,
        error: true,
      },
      { status: 403 }
    );
  }

  // Validate CORS if origin is present
  let corsHeaders: HeadersInit | undefined;
  if (origin) {
    const allowedOrigins = await getAppAllowedOriginsForEnvironment(
      client_app_id,
      environment,
      dbh
    );

    if (!isOriginAllowedForClientApp(origin, allowedOrigins)) {
      return NextResponse.json(
        {
          message: `Origin '${origin}' is not allowed for app '${client_app_id}'`,
          success: false,
          error: true,
        },
        { status: 403 }
      );
    }

    corsHeaders = buildCorsHeaders(origin);
  }

  const logout_success_response = NextResponse.json(
    {
      message: "Cleared refresh token successfully",
      success: true,
      error: false,
    },
    {
      status: 200,
      headers: corsHeaders,
    }
  );

  const refresh_token_cookie_name: string = RefreshTokenCookieName(client_app_id);
  const refresh_token_expiry_cookie_name: string =
    RefreshTokenExpiryCookieName(client_app_id);

  try {
    const domain: string = getHostname(req);
    if (debug) {
      console.log(
        `[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_cookie_name}' from domain '${domain}'`
      );
    }
    await deleteCookie(refresh_token_cookie_name satisfies string, {
      httpOnly: true,
      req,
      res: logout_success_response,
      domain,
    });
    if (debug) {
      console.log(
        `[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_expiry_cookie_name}' from domain '${domain}'`
      );
    }
    await deleteCookie(refresh_token_expiry_cookie_name satisfies string, {
      httpOnly: false,
      req,
      res: logout_success_response,
      domain,
    });
  } catch (e: unknown) {
    console.error("Failed to delete refresh token cookie: ", e);
    return NextResponse.json(
      {
        message: "Failed to delete your refresh token cookies!",
        success: false,
        error: true,
      },
      {
        headers: corsHeaders,
        status: 500
      }
    );
  }

  return logout_success_response;
}

export const dynamic = "force-dynamic";
