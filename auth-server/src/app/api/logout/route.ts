import "server-only";
import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import getHostname from "@/lib/hostname";
import { RefreshTokenCookieName,  RefreshTokenExpiryCookieName } from "@/lib/RefreshTokenCookieNames";

export async function POST(req: NextRequest): Promise<NextResponse> {
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
    await deleteCookie(RefreshTokenCookieName satisfies string, {
      httpOnly: true,
      req,
      res: response,
      domain: getHostname(req),
    });
    await deleteCookie(RefreshTokenExpiryCookieName satisfies string, {
      httpOnly: false,
      req,
      res: response,
      domain: getHostname(req),
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
