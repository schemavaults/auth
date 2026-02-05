import "server-only";
import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import getHostname from "@/lib/hostname";
import { RefreshTokenCookieName,  RefreshTokenExpiryCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { AppId, appIdSchema, getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerRuntime } from "next";

export async function POST(req: NextRequest, ctx: RouteContext<'/api/auth/logout/[client_app_id]'>): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const params = await ctx.params;
  if (!("client_app_id" in params) || !params.client_app_id || !appIdSchema.safeParse(params.client_app_id).success) {
    return NextResponse.json(
      {
        message: "Missing 'client_app_id' in logout request!",
        success: false,
        error: true,
      },
      {
        status: 400,
      },
    );
  }
  const client_app_id: AppId = params.client_app_id;

  if (debug) {
    console.log(`${req.method} => /api/auth/logout/${client_app_id}`)
  }

  const response = NextResponse.json(
    {
      message: "Cleared refresh token successfully",
      success: true,
      error: false,
    },
    {
      status: 200,
    },
  );

  const refresh_token_cookie_name: string = RefreshTokenCookieName(client_app_id)
  const refresh_token_expiry_cookie_name: string = RefreshTokenExpiryCookieName(client_app_id)

  try {
    const domain: string = getHostname(req)
    if (debug) {
      console.log(`[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_cookie_name}' from domain '${domain}'`)
    }
    await deleteCookie(refresh_token_cookie_name satisfies string, {
      httpOnly: true,
      req,
      res: response,
      domain,
    });
    if (debug) {
      console.log(`[/api/auth/logout/${client_app_id}] Deleting cookie with ID '${refresh_token_expiry_cookie_name}' from domain '${domain}'`)
    }
    await deleteCookie(refresh_token_expiry_cookie_name satisfies string, {
      httpOnly: false,
      req,
      res: response,
      domain,
    });
  } catch (e: unknown) {
    console.error("Failed to delete refresh token cookie: ", e);
    return NextResponse.json({
      message: "Logged out successfully",
      success: true,
      error: false,
    });
  }

  return response;
}

export const runtime: ServerRuntime = 'edge';
export const dynamic = "force-dynamic";
