import { JWT_Factory, JWT_Keys, decodeJWT } from "@schemavaults/jwt";
import {
  type OrganizationsRegistry,
  type ServerlessDatabase,
  type UserRegistry,
  loadUserData,
} from "@/lib/auth-db";
import {
  type OrganizationID,
  type RequestTokensResult,
  type UserData,
  type refreshTokenPOSTbody,
} from "@schemavaults/auth-common";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { validateAudience } from "./validate-audience";
import {
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

export async function handleRefreshTokenGrant(
  refresh_token: string,
  body: z.infer<typeof refreshTokenPOSTbody>,
  usersRegistry: UserRegistry,
  orgRegistry: OrganizationsRegistry,
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = shouldEnableDebug(environment),
): Promise<NextResponse> {
  let decoded: UserData;
  try {
    decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys: await JWT_Keys.init(),
    });
  } catch (e: unknown) {
    let errorDecodingTokenMsg: string = "Failed to decode refresh token";

    if (!!e && typeof e === "object") {
      if ("code" in e && e.code === "ERR_JWT_EXPIRED") {
        errorDecodingTokenMsg = "[ERR_JWT_EXPIRED] Refresh token has expired!";
      }
    }

    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: errorDecodingTokenMsg,
      } satisfies RequestTokensResult,
      {
        status: 401,
      },
    );
  }

  const { uid } = decoded;

  let user: UserData;
  try {
    user = await loadUserData(uid, usersRegistry);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load user data",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  const audience: string | readonly string[] = body.audience;
  try {
    const isValidAudience: boolean = await validateAudience(
      uid,
      body.client_app_id,
      audience,
      dbh,
      debug satisfies boolean,
    );
    if (!isValidAudience) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid token audience",
        } satisfies RequestTokensResult,
        {
          status: 401,
        },
      );
    }
  } catch (e: unknown) {
    console.error("Failed to validate token audience(s): ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to validate token audience(s)",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  let user_organizations: readonly OrganizationID[];
  try {
    user_organizations = await orgRegistry.listUserOrganizationMemberships(
      user.uid,
    );
  } catch (e: unknown) {
    console.error("Failed to list user's associated organizations: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list user's associated organizations!",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  try {
    const jwt_factory = new JWT_Factory({
      user,
      client_app_id: body.client_app_id,
      jwt_keys: await JWT_Keys.init(),
      environment,
      user_organizations,
    });
    if (body.replaceRefreshToo) {
      return NextResponse.json(
        {
          success: true,
          message: "Generated refresh and access tokens successfully",
          tokens: (await jwt_factory.generateTokens(body.audience, true))
            .tokens,
          userData: user,
        } satisfies RequestTokensResult,
        {
          status: 200,
        },
      );
    }

    // Else, just generate an access token
    if (typeof body.audience === "string") {
      const access_token = await jwt_factory.access(body.audience);
      return NextResponse.json(
        {
          success: true,
          message: "Generated access token successfully",
          tokens: {
            access: {
              [body.audience]: access_token,
            },
          },
          userData: user,
        } satisfies RequestTokensResult,
        {
          status: 200,
        },
      );
    }

    const tokens = (
      await jwt_factory.generateTokens(
        body.audience,
        false /** don't regen refresh token */,
      )
    ).tokens;

    if (debug) {
      console.log("[handleRefreshTokenGrant]");
    }

    return NextResponse.json(
      {
        success: true,
        message: "Generated refresh and access tokens successfully",
        tokens,
        userData: user,
      } satisfies RequestTokensResult,
      {
        status: 200,
      },
    );
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate new tokens",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
}
