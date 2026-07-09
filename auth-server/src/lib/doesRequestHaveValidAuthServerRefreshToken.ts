import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import type { NextRequest } from "next/server";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import { ServerlessDatabase } from "./auth-db";
import { RefreshTokenExpiryCookieName, RefreshTokenCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { cookies } from "next/headers";

type RequestCookies = NextRequest['cookies'];
type NextjsCookiesGetterResult = Awaited<ReturnType<typeof cookies>>;

async function doesCookiesStoreHaveValidRefreshToken(
  cookies: RequestCookies | NextjsCookiesGetterResult
): Promise<UserData | false> {
  const auth_server_app_id = getAuthServerAppId();
  if (!cookies.has(RefreshTokenExpiryCookieName(auth_server_app_id))) {
    return false;
  } else if (!cookies.has(RefreshTokenCookieName(auth_server_app_id))) {
    return false;
  }

  const refresh_token: string | undefined = cookies.get(RefreshTokenCookieName(auth_server_app_id))?.value;
  if (!refresh_token) {
    return false;
  }

  try {
    await using dbh = ServerlessDatabase.createDBH();

    const route_guard_factory: RouteGuardFactory = new RouteGuardFactory(dbh.db);
    const route_guard: IRouteGuard = await route_guard_factory.createGuardFromTokenSources(
      'authenticated',
      [{
        type: 'refresh',
        token: refresh_token,
        sourceHint: `From cookie with key '${RefreshTokenCookieName(auth_server_app_id)}'`
      }],
      auth_server_app_id,
    );

    if (!route_guard.isAccessAllowed() || !route_guard.user) {
      return false;
    }

    const user: UserData = route_guard.user;
    return user;
  } catch (e: unknown) {
    console.error(
      "[doesCookiesStoreHaveValidRefreshToken] Failed to check if user is already authenticated, treating as not authenticated:",
      e
    );
    return false;
  }
}

export async function doesRequestHaveValidAuthServerRefreshToken(req: NextRequest): Promise<UserData | false> {
  return await doesCookiesStoreHaveValidRefreshToken(req.cookies);
}

export async function doesSsrContextHaveValidAuthServerRefreshToken(): Promise<UserData | false> {
  return await doesCookiesStoreHaveValidRefreshToken(await cookies());
}

export default doesRequestHaveValidAuthServerRefreshToken;
