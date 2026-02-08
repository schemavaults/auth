import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import type { NextRequest } from "next/server";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import { ServerlessDatabase } from "./auth-db";
import { RefreshTokenExpiryCookieName, RefreshTokenCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { cookies } from "next/headers";

type RequestCookies = NextRequest['cookies'];
type NextjsCookiesGetterResult = Awaited<ReturnType<typeof cookies>>;

async function doesCookiesStoreHaveValidRefreshToken(
  cookies: RequestCookies | NextjsCookiesGetterResult
): Promise<UserData | false> {
  if (!cookies.has(RefreshTokenExpiryCookieName(SCHEMAVAULTS_AUTH_APP_ID))) {
    return false;
  } else if (!cookies.has(RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID))) {
    return false;
  }

  const refresh_token: string | undefined = cookies.get(RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID))?.value;
  if (!refresh_token) {
    return false;
  }

  await using dbh = ServerlessDatabase.createDBH();
  const route_guard_factory: RouteGuardFactory = new RouteGuardFactory(dbh.db);
  const route_guard: IRouteGuard = await route_guard_factory.createGuardFromTokenSources('authenticated', [{
    type: 'refresh',
    token: refresh_token,
    sourceHint: `From cookie with key '${RefreshTokenCookieName}'`
  }], SCHEMAVAULTS_AUTH_APP_ID);

  if (!route_guard.isAccessAllowed() || !route_guard.user) {
    return false;
  }

  const user: UserData = route_guard.user;
  return user;
}

export async function doesRequestHaveValidAuthServerRefreshToken(req: NextRequest): Promise<UserData | false> {
  return await doesCookiesStoreHaveValidRefreshToken(req.cookies);
}

export async function doesSsrContextHaveValidAuthServerRefreshToken(): Promise<UserData | false> {
  return await doesCookiesStoreHaveValidRefreshToken(await cookies());
}

export default doesRequestHaveValidAuthServerRefreshToken;
