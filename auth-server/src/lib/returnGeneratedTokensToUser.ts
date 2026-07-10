import "server-only";
import {
  type RefreshToken,
  type RequestTokensResult,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import type { AppId } from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import setRefreshTokenCookieOnResponse from "@/lib/setRefreshTokenCookieOnResponse";

export interface IReturnGeneratedTokensToUserOpts {
  client_app_id: AppId;
  req: NextRequest;
  tokenGenerationResult: RequestTokensResult;
  secure: boolean;
  hostname: string;
  debug?: boolean;
}

function determineReturnRefreshTokenStrategy(
  client_app_id: AppId,
  secure: boolean
): 'AS_HTTP_ONLY_COOKIE' | 'inlined' {
  // always use http-only cookies for auth-server
  if (client_app_id === getAuthServerAppId()) {
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
    tokenGenerationResult.tokens.refresh_token_expiry = refresh_token.exp;
  }

  const success_response = NextResponse.json(
    tokenGenerationResult satisfies RequestTokensResult,
    {
      status: 200,
    },
  );

  if (refresh_token && return_refresh_token_strategy === 'AS_HTTP_ONLY_COOKIE') {
    await setRefreshTokenCookieOnResponse({
      refresh_token,
      client_app_id,
      req,
      res: success_response,
      secure,
      hostname,
      debug,
    });
  }


  return success_response;
}
