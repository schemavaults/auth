import {
  type I_JWT_Keys,
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
} from "@schemavaults/jwt";
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
  MAXIMUM_USER_ORGANIZATIONS,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import validateAudience from "@/lib/validate-audience";
import {
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import AuthServerJwtKeysManager, {
  generateTokensForAuthenticatedUser,
} from "@/lib/AuthServerJwtKeysManager";
import returnGeneratedTokensToUser from "@/lib/returnGeneratedTokensToUser";
import getHostname from "@/lib/hostname";
import ClientApplicationNotAuthorizedByUser from "@/lib/error/ClientApplicationNotAuthorizedByUser";

export async function handleRefreshTokenGrant(
  req: NextRequest,
  refresh_token: string,
  body: z.infer<typeof refreshTokenPOSTbody>,
  usersRegistry: UserRegistry,
  orgRegistry: OrganizationsRegistry,
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = shouldEnableDebug(environment),
): Promise<NextResponse> {
  let refresh_token_keyset_id: string;
  try {
    refresh_token_keyset_id = getKeysetIdFromToken(refresh_token);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to retrieve refresh token keyset ID",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  let refresh_token_audience_id: string;
  try {
    refresh_token_audience_id = getAudienceFromToken(refresh_token);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to retrieve refresh token keyset ID",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
  if (refresh_token_audience_id !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Invalid audience ID",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  let jwt_keys_manager: AuthServerJwtKeysManager;
  try {
    jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db);
  } catch (e: unknown) {
    console.error("Failed to initialize JWT key manager: ", e);
    throw new Error("Failed to initialize JWT key manager");
  }

  let refresh_token_keyset: I_JWT_Keys;
  try {
    refresh_token_keyset = await jwt_keys_manager.getKeyset(
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      refresh_token_keyset_id,
    );
  } catch (e: unknown) {
    console.error("Failed to retrieve refresh token keyset: ", e);
    const isKeysetExpiredError: boolean =
      e instanceof Error && e.message.includes("expired");
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to retrieve refresh token keyset",
      } satisfies RequestTokensResult,
      {
        status: isKeysetExpiredError ? 401 : 500,
      },
    );
  }

  let decoded: UserData;
  try {
    decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys: refresh_token_keyset,
      env: environment,
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
        error: true,
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
    console.error("Failed to load user data: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
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
          error: true,
          message: "Invalid token audience",
        } satisfies RequestTokensResult,
        {
          status: 401,
        },
      );
    }
  } catch (e: unknown) {
    if (e instanceof ClientApplicationNotAuthorizedByUser) {
      console.warn("[handleAuthorizationCodeGrant] App is not authorized by user!");
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: e.message,
        } satisfies RequestTokensResult,
        {
          status: 403,
        },
      );
    }
    console.error("Failed to validate token audience(s): ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to validate token audience(s)",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  let user_organizations: readonly OrganizationID[];
  try {
    user_organizations = await orgRegistry.listUserOrganizationMembershipIds(
      user.uid,
      user.admin ?? false
    );
  } catch (e: unknown) {
    console.error("Failed to list user's associated organizations: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to list user's associated organizations!",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  // Warn if user has exceeded the maximum organization membership limit
  // This should not happen if enforcement is working, but log for monitoring data inconsistencies
  if (user_organizations.length > MAXIMUM_USER_ORGANIZATIONS) {
    console.warn(
      `[RefreshTokenGrant] User '${uid}' has ${user_organizations.length} organization memberships, ` +
      `which exceeds the maximum of ${MAXIMUM_USER_ORGANIZATIONS}. ` +
      `This may indicate a data inconsistency.`
    );
  }

  try {
    const replaceRefreshToo: boolean =
      typeof body.replaceRefreshToo === "boolean"
        ? body.replaceRefreshToo
        : false;

    const tokenGenerationResult: RequestTokensResult =
      await generateTokensForAuthenticatedUser({
        user,
        client_app_id: body.client_app_id,
        audiences: Array.isArray(body.audience)
          ? body.audience
          : [body.audience],
        environment,
        user_organizations,
        generate_refresh: replaceRefreshToo,
        auth_jwt_manager: jwt_keys_manager,
      });

    if (!tokenGenerationResult.success || tokenGenerationResult.error) {
      throw new Error(tokenGenerationResult.message);
    }

    const isHttpsOnly: boolean =
      environment !== "development" && environment !== "test";
    return (await returnGeneratedTokensToUser({
      client_app_id: body.client_app_id,
      req,
      tokenGenerationResult,
      secure: isHttpsOnly,
      hostname: getHostname(req),
      debug,
    })) satisfies NextResponse;
  } catch (e: unknown) {
    console.error("Failed to generate new tokens: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to generate new tokens",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
}

export default handleRefreshTokenGrant;
