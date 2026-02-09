import "server-only";
import type {
  RefreshToken,
  RequestTokensResult,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { setCookie } from "cookies-next/server";
import { RefreshTokenCookieName, RefreshTokenExpiryCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";
import type { AppId } from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";

export interface IReturnGeneratedTokensToUserOpts {
  client_app_id: AppId;
  req: NextRequest;
  tokenGenerationResult: RequestTokensResult;
  secure: boolean;
  hostname: string;
  debug?: boolean;
}

function isLocalhostDomain(hostname: string): boolean {
  if (hostname === 'localhost') {
    return true;
  }

  if (hostname.startsWith('localhost:')) {
    return true;
  }

  return false;
}

// SameSite=none | send cookie in all contexts
// SameSite=strict | send cookie in same-site contexts (navigations and other requests)
// SameSite=lax | send cookie in same-site requests and when navigating
function determineCookieSameSiteValue(
  client_app_id: AppId,
  secure: boolean
): 'none' | 'lax' | 'strict' {
  const isAuthServer: boolean = SCHEMAVAULTS_AUTH_APP_ID === client_app_id;
  if (isAuthServer) {
    return secure ? "strict": "lax";
  } else {
    return "lax";
  }
}

function determineReturnRefreshTokenStrategy(
  client_app_id: AppId,
  secure: boolean
): 'AS_HTTP_ONLY_COOKIE' | 'inlined' {
  // always use http-only cookies for auth-server
  if (client_app_id === SCHEMAVAULTS_AUTH_APP_ID) {
    return 'AS_HTTP_ONLY_COOKIE';
  } else if (secure) {
    return 'AS_HTTP_ONLY_COOKIE';
  } else {
    return 'inlined';
  }
}

export default async function returnGeneratedTokensToUser({
  client_app_id,
  req,
  tokenGenerationResult,
  secure,
  hostname,
  debug = false,
}: IReturnGeneratedTokensToUserOpts): Promise<NextResponse> {
  if (!tokenGenerationResult.success || tokenGenerationResult.error || !tokenGenerationResult.tokens) {
    throw new Error(tokenGenerationResult.message);
  }

  if (!tokenGenerationResult.client_app_id) {
    throw new TypeError("Client application ID 'client_app_id' is required.");
  }

  if (tokenGenerationResult.userOrgs && !tokenGenerationResult.userData) {
    throw new Error(
      "User organizations 'userOrgs' may not be supplied without user data object 'userData'.",
    );
  }

  const return_refresh_token_strategy: 'AS_HTTP_ONLY_COOKIE' | 'inlined' = determineReturnRefreshTokenStrategy(
    client_app_id,
    secure
  );

  if (tokenGenerationResult.tokens?.refresh && typeof tokenGenerationResult.tokens.refresh !== "object") {
    throw new TypeError("Expected 'refresh' token to be an object, if one was generated!")
  }

  const refresh_token: RefreshToken | undefined = (tokenGenerationResult.tokens.refresh &&
    typeof tokenGenerationResult.tokens.refresh === "object") ? tokenGenerationResult.tokens.refresh : undefined;

  if (refresh_token && return_refresh_token_strategy === 'AS_HTTP_ONLY_COOKIE') {
    // replace actual token with indicator that token is set as http-only cookie
    tokenGenerationResult.tokens.refresh = "AS_HTTP_ONLY_COOKIE";
  }

  const success_response = NextResponse.json(
    tokenGenerationResult satisfies RequestTokensResult,
    {
      status: 200,
    },
  );

  if (refresh_token && return_refresh_token_strategy === 'AS_HTTP_ONLY_COOKIE') {
    await (async function setHttpOnlyRefreshTokenCookie(): Promise<void> {

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

      const sameSite: "strict" | "none" | "lax" = determineCookieSameSiteValue(
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
        res: success_response,
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
        res: success_response,
      };
      if (!secure && isLocalhostDomain(hostname)) {
        delete (refreshTokenExpirySetCookieOpts as Partial<typeof refreshTokenExpirySetCookieOpts>).domain;
      }
      await setCookie(RefreshTokenExpiryCookieName(client_app_id), `${refresh_token.exp satisfies number}` satisfies string, refreshTokenExpirySetCookieOpts);
    })()
  }


  return success_response;
}
