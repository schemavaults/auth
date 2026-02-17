import "server-only";
import {
  determineRefreshTokenCookieSameSiteValue,
  type RefreshToken,
} from "@schemavaults/auth-common";
import type { NextRequest, NextResponse } from "next/server";
import { setCookie } from "cookies-next/server";
import { RefreshTokenCookieName, RefreshTokenExpiryCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";
import type { AppId } from "@schemavaults/app-definitions";

function isLocalhostDomain(hostname: string): boolean {
  if (hostname === 'localhost') {
    return true;
  }

  if (hostname.startsWith('localhost:')) {
    return true;
  }

  return false;
}

export interface SetRefreshTokenCookieOnResponseOpts {
  refresh_token: RefreshToken;
  client_app_id: AppId;
  req: NextRequest;
  res: NextResponse;
  secure: boolean;
  hostname: string;
  debug?: boolean;
}

export default async function setRefreshTokenCookieOnResponse({
  refresh_token,
  client_app_id,
  req,
  res,
  secure,
  hostname,
  debug = false,
}: SetRefreshTokenCookieOnResponseOpts): Promise<void> {
  if (debug) {
    console.log(
      `Setting HTTP${secure ? "S" : ""}-only refresh token on domain: `,
      hostname,
    );
  }

  const refreshTokenSize: number = getStringByteSize(refresh_token.token satisfies string)
  if (typeof refreshTokenSize !== 'number' || isNaN(refreshTokenSize)) {
    throw new TypeError("Expected result of getStringByteSize to be a number!");
  }
  if (refreshTokenSize > MaximumBrowserCookieSize) {
    throw new Error(
      `Refresh token size exceeds maximum browser cookie size of ${MaximumBrowserCookieSize} bytes (with ${refreshTokenSize} bytes)! Cannot set refresh token as HTTP-only cookie.`,
    );
  }

  const sameSite: "strict" | "none" | "lax" = determineRefreshTokenCookieSameSiteValue(
    client_app_id,
    secure
  );

  const refreshTokenSetCookieOpts = {
    httpOnly: true,
    secure,
    expires: new Date(refresh_token.exp satisfies number),
    sameSite,
    domain: hostname,
    req,
    res,
  };
  if (!secure && isLocalhostDomain(hostname)) {
    delete (refreshTokenSetCookieOpts as Partial<typeof refreshTokenSetCookieOpts>).domain;
  }

  await setCookie(RefreshTokenCookieName(client_app_id), refresh_token.token satisfies string, refreshTokenSetCookieOpts);

  // set a non-http-only cookie with the refresh token expiry time
  // this way client should know if it is authenticated or not.
  // don't use this cookie for auth, just for client-side logic
  const refreshTokenExpirySetCookieOpts = {
    httpOnly: false,
    secure,
    expires: new Date(refresh_token.exp satisfies number),
    sameSite,
    domain: hostname,
    req,
    res,
  };
  if (!secure && isLocalhostDomain(hostname)) {
    delete (refreshTokenExpirySetCookieOpts as Partial<typeof refreshTokenExpirySetCookieOpts>).domain;
  }
  await setCookie(RefreshTokenExpiryCookieName(client_app_id), `${refresh_token.exp satisfies number}` satisfies string, refreshTokenExpirySetCookieOpts);
}
