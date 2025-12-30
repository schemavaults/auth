import "server-only";
import type {
  RefreshToken,
  RequestTokensResult,
} from "@schemavaults/auth-common";
import { NextResponse } from "next/server";
import { setCookie } from "cookies-next";

export interface IReturnGeneratedTokensToUserOpts {
  tokenGenerationResult: RequestTokensResult;
  secure: boolean;
  hostname: string;
  debug?: boolean;
}

export default async function returnGeneratedTokensToUser({
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

  if (tokenGenerationResult.tokens?.refresh) {
    if (typeof tokenGenerationResult.tokens.refresh !== "object") {
      console.error(
        "Refresh token is not an object. Any replacement of refresh token with HTTP-only cookie should happen after this point.",
      );
      throw new TypeError("Refresh token is not an object.");
    }
    const refresh_token: RefreshToken = tokenGenerationResult.tokens.refresh;

    if (debug) {
      console.log("Setting HTTP-only refresh token on domain: ", hostname);
    }

    await setCookie("refresh_token", refresh_token.token satisfies string, {
      httpOnly: true,
      secure,
      expires: new Date(refresh_token.exp satisfies number),
      sameSite: "strict",
      domain: hostname,
    });
    // replace actual token with indicator that token is set as http-only cookie
    tokenGenerationResult.tokens.refresh = "AS_HTTP_ONLY_COOKIE";
  }

  return NextResponse.json(
    tokenGenerationResult satisfies RequestTokensResult,
    {
      status: 200,
    },
  );
}
