import "server-only";
import type {
  RefreshToken,
  RequestTokensResult,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { setCookie } from "cookies-next/server";
import { RefreshTokenCookieName, RefreshTokenExpiryCookieName } from "@/lib/RefreshTokenCookieNames";
import getStringByteSize from "@/lib/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";

export interface IReturnGeneratedTokensToUserOpts {
  req: NextRequest;
  tokenGenerationResult: RequestTokensResult;
  secure: boolean;
  hostname: string;
  debug?: boolean;
}

export default async function returnGeneratedTokensToUser({
  req,
  tokenGenerationResult,
  secure,
  hostname,
  debug = false,
}: IReturnGeneratedTokensToUserOpts): Promise<NextResponse> {
  if (!tokenGenerationResult.success || tokenGenerationResult.error) {
    throw new Error(tokenGenerationResult.message);
  }

  if (!tokenGenerationResult.client_app_id) {
    throw new Error("Client application ID 'client_app_id' is required.");
  }

  if (tokenGenerationResult.userOrgs && !tokenGenerationResult.userData) {
    throw new Error(
      "User organizations 'userOrgs' may not be supplied without user data object 'userData'.",
    );
  }

  let refresh_token: RefreshToken | undefined = undefined;
  if (
    // Extract refresh token from generation, pass as http-only cookie
    tokenGenerationResult.tokens?.refresh &&
    typeof tokenGenerationResult.tokens.refresh === "object"
  ) {
    refresh_token = tokenGenerationResult.tokens.refresh;
    // replace actual token with indicator that token is set as http-only cookie
    tokenGenerationResult.tokens.refresh = "AS_HTTP_ONLY_COOKIE";
  }

  const success_response = NextResponse.json(
    tokenGenerationResult satisfies RequestTokensResult,
    {
      status: 200,
    },
  );

  async function setRefreshTokenCookie(): Promise<void> {
    if (refresh_token) {
      if (debug) {
        console.log(
          `Setting HTTP${secure ? "S" : ""}-only refresh token on domain: `,
          hostname,
        );
      }

      if (getStringByteSize(refresh_token.token satisfies string) > MaximumBrowserCookieSize) {
        throw new Error(
          `Refresh token size exceeds maximum browser cookie size of ${MaximumBrowserCookieSize} bytes! Cannot set refresh token as HTTP-only cookie.`,
        );
      }

      const refreshTokenSetCookieOpts = {
        httpOnly: true,
        secure,
        expires: new Date(refresh_token.exp satisfies number),
        sameSite: secure ? "strict" : "lax",
        domain: hostname,
        req,
        res: success_response,
      };
      if (!secure && hostname.startsWith('localhost:')) {
        delete (refreshTokenSetCookieOpts as Partial<typeof refreshTokenSetCookieOpts>).domain;
      }

      await setCookie(RefreshTokenCookieName, refresh_token.token satisfies string, refreshTokenSetCookieOpts);
      
      
      // set a non-http-only cookie with the refresh token expiry time
      // this way client should know if it is authenticated or not.
      // don't use this cookie for auth, just for client-side logic
      const refreshTokenExpirySetCookieOpts = {
        httpOnly: false,
        secure,
        expires: new Date(refresh_token.exp satisfies number),
        sameSite: secure ? "strict" : "lax",
        domain: hostname,
        req,
        res: success_response,
      };
      if (!secure && hostname.startsWith('localhost:')) {
        delete (refreshTokenExpirySetCookieOpts as Partial<typeof refreshTokenExpirySetCookieOpts>).domain;
      }
      await setCookie(RefreshTokenExpiryCookieName, `${refresh_token.exp satisfies number}` satisfies string, refreshTokenExpirySetCookieOpts);
    }
  }
  await setRefreshTokenCookie();

  return success_response;
}
