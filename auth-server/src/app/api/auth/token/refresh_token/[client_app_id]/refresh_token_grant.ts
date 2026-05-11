import {
  type I_JWT_Keys,
  type CustomJWTPayload,
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
} from "@schemavaults/jwt";
import {
  type OrganizationsRegistry,
  type ServerlessDatabase,
  type UserRegistry,
  loadUserData,
  isTokenRevoked,
  getUserTokensValidAfter,
  isTokenIatRevoked,
} from "@/lib/auth-db";
import {
  type OrganizationID,
  type RequestTokensResult,
  type UserData,
  type refreshTokenPOSTbody,
  MAXIMUM_USER_ORGANIZATIONS,
  ERROR_MESSAGE_CATALOG,
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
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/token/refresh_token/[client_app_id]";

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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.getKeysetIdFromToken",
      route: ROUTE,
      context: { client_app_id: body.client_app_id },
    });
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.getAudienceFromToken",
      route: ROUTE,
      context: { client_app_id: body.client_app_id },
    });
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.initJwtKeysManager",
      route: ROUTE,
      context: { client_app_id: body.client_app_id },
    });
    throw new Error("Failed to initialize JWT key manager");
  }

  let refresh_token_keyset: I_JWT_Keys;
  try {
    refresh_token_keyset = await jwt_keys_manager.getKeyset(
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      refresh_token_keyset_id,
    );
  } catch (e: unknown) {
    const isKeysetExpiredError: boolean =
      e instanceof Error && e.message.includes("expired");
    if (!isKeysetExpiredError) {
      await captureServerException(dbh.db, e, {
        op_name: "handleRefreshTokenGrant.getKeyset",
        route: ROUTE,
        context: { client_app_id: body.client_app_id, refresh_token_keyset_id },
      });
    }
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

  let decoded: CustomJWTPayload;
  try {
    decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys: refresh_token_keyset,
      env: environment,
    });
  } catch (e: unknown) {
    let errorDecodingTokenMsg: string = "Failed to decode refresh token";
    let isJwtExpired: boolean = false;

    if (!!e && typeof e === "object") {
      if ("code" in e && e.code === "ERR_JWT_EXPIRED") {
        errorDecodingTokenMsg = "[ERR_JWT_EXPIRED] Refresh token has expired!";
        isJwtExpired = true;
      }
    }

    if (!isJwtExpired) {
      await captureServerException(dbh.db, e, {
        op_name: "handleRefreshTokenGrant.decodeJWT",
        route: ROUTE,
        context: { client_app_id: body.client_app_id },
      });
    }
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

  // Check if the refresh token has been revoked
  if (decoded.jti) {
    try {
      const revoked = await isTokenRevoked(dbh.db, decoded.jti);
      if (revoked) {
        return NextResponse.json(
          {
            success: false,
            error: true,
            message: "Refresh token has been revoked",
          } satisfies RequestTokensResult,
          {
            status: 401,
          },
        );
      }
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "handleRefreshTokenGrant.isTokenRevoked",
        route: ROUTE,
        uid: decoded.uid,
        context: { client_app_id: body.client_app_id, jti: decoded.jti },
      });
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: "Failed to check token revocation status",
        } satisfies RequestTokensResult,
        {
          status: 500,
        },
      );
    }
  }

  // Check the per-user `tokens_valid_after` watermark. Bumped on
  // password reset to revoke every refresh token issued before the
  // reset, even ones we never recorded a JTI for.
  let tokens_valid_after: number;
  try {
    tokens_valid_after = await getUserTokensValidAfter(dbh.db, decoded.uid);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.getUserTokensValidAfter",
      route: ROUTE,
      uid: decoded.uid,
      context: { client_app_id: body.client_app_id },
    });
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to check token revocation status",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Refresh token has been revoked",
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.loadUserData",
      route: ROUTE,
      uid,
    });
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

  if (user.disabled) {
    console.warn(
      `[RefreshTokenGrant] Blocked token refresh for disabled account (uid: ${uid})`,
    );
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: ERROR_MESSAGE_CATALOG.account_disabled,
      } satisfies RequestTokensResult,
      {
        status: 403,
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.validateAudience",
      route: ROUTE,
      uid,
      context: { client_app_id: body.client_app_id, audience },
    });
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.listUserOrganizationMembershipIds",
      route: ROUTE,
      uid,
    });
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
        tracking: {
          db: dbh.db,
          grant_type: "refresh_token",
        },
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRefreshTokenGrant.generateTokens",
      route: ROUTE,
      uid,
      context: { client_app_id: body.client_app_id, audience },
    });
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
