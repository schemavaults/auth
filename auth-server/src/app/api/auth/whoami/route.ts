import 'server-only';
import { type ResourceCreationResponse, ServerlessDatabase } from "@/lib/auth-db";
import RefreshTokenCookieName from "@/lib/RefreshTokenCookieNames";
import type { UserData } from "@schemavaults/auth-common";
import { type IRouteGuard } from "@schemavaults/auth-server-sdk";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import { type NextRequest, NextResponse } from "next/server";
import SCHEMAVAULTS_AUTH_APP_ID from "@/lib/SCHEMAVAULTS_AUTH_APP_ID";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
  
  const refresh_token: string | null = req.cookies.get(RefreshTokenCookieName)?.value ?? null;
  if (!refresh_token || refresh_token.length < 64) {
    return NextResponse.json(
      {
        success: false,
        message: "No refresh token cookie provided",
      } satisfies ResourceCreationResponse,
      {
        status: 401,
      },
    );
  }

  // Make sure user is authenticated and load user data
  let userData: UserData;
  try {
    const route_guard_factory = new RouteGuardFactory(dbh.db)
    const route_guard: IRouteGuard = await route_guard_factory.createGuardFromTokenSources(
      'authenticated',
      [{ type: "refresh", token: refresh_token, sourceHint: "Refresh token cookie" }],
      SCHEMAVAULTS_AUTH_APP_ID
    );
    const user: UserData | null = route_guard.user;
    if (!route_guard.isAccessAllowed()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your access token does not grant you access to this resource",
        } satisfies ResourceCreationResponse,
        {
          status: 403,
        },
      );
    }
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to load user from authorization token",
        } satisfies ResourceCreationResponse,
        {
          status: 401,
        },
      );
    }
    userData = user;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message:
          "You must pass a valid access token in the Authorization header to use this resource",
      } satisfies ResourceCreationResponse,
      {
        status: 401,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      user: userData
    },
    {
      status: 200
    }
  );
}
