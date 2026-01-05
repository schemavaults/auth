import { deleteCookie } from "cookies-next/server";
import { type NextRequest, NextResponse } from "next/server";
import "server-only";

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
    await deleteCookie("refresh_token", {
      httpOnly: true,
      req,
      res: response,
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
