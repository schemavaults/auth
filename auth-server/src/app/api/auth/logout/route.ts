import "server-only";
import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import getHostname from "@/lib/hostname";
import { RefreshTokenCookieName,  RefreshTokenExpiryCookieName } from "@/lib/RefreshTokenCookieNames";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  if (debug) {
    console.log(`${req.method} => /api/auth/logout`)
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

  try {
    const domain: string = getHostname(req)
    if (debug) {
      console.log(`[/api/auth/logout] Deleting cookie with ID '${RefreshTokenCookieName}' from domain '${domain}'`)
    }
    await deleteCookie(RefreshTokenCookieName satisfies string, {
      httpOnly: true,
      req,
      res: response,
      domain,
    });
    if (debug) {
      console.log(`[/api/auth/logout] Deleting cookie with ID '${RefreshTokenExpiryCookieName}' from domain '${domain}'`)
    }
    await deleteCookie(RefreshTokenExpiryCookieName satisfies string, {
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
