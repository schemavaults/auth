import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import {
  organizationIdSchema,
  type OrganizationID,
  type RequestTokensResult,
  type UserData,
  type authorizationCodePOSTbody,
} from "@schemavaults/auth-common";
import {
  type ServerlessDatabase,
  type UserRegistry,
  type OrganizationsRegistry,
  loadUserData,
} from "@/lib/auth-db";
import validateAudience from "@/lib/validate-audience";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  AuthServerJwtKeysManager,
  generateTokensForAuthenticatedUser,
} from "@/lib/AuthServerJwtKeysManager";
import returnGeneratedTokensToUser from "@/lib/returnGeneratedTokensToUser";
import getHostname from "@/lib/hostname";

export async function handleAuthorizationCodeGrant(
  req: NextRequest,
  body: z.infer<typeof authorizationCodePOSTbody>,
  userRegistry: UserRegistry,
  orgRegistry: OrganizationsRegistry,
  dbh: ServerlessDatabase,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = shouldEnableDebug(environment),
): Promise<NextResponse> {
  const authorization_code: string = body.code;
  if (typeof authorization_code !== "string" || !authorization_code) {
    throw new Error("Did not receive authorization code from request body!");
  }
  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Received authorization code: "${authorization_code}"`,
    );
  }

  const code_verifier: string = body.code_verifier;
  if (typeof code_verifier !== "string" || !code_verifier) {
    throw new Error("Did not receive code verifier from request body!");
  }
  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Received code verifier: ${code_verifier}`,
    );
  }

  const challenge_time: number = body.challenge_time;

  let uid: string;
  try {
    if (debug) {
      console.log(
        `[AuthorizationCodeGrant] Attempting to validate authorization code...`,
      );
    }

    const result = await userRegistry.validateAuthorizationCode(
      authorization_code,
      code_verifier,
      challenge_time,
    );
    if (!result || typeof result.uid !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: "Invalid authorization code or code_verifier",
        } satisfies RequestTokensResult,
        {
          status: 400,
        },
      );
    }
    uid = result.uid;
  } catch (e: unknown) {
    console.error(
      "[AuthorizationCodeGrant] Failed to validate authorization code",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to validate authorization code",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Authorization code validated successfully; ` +
        `generating tokens for user with uid "${uid}"...`,
    );
  }

  let user: UserData;
  try {
    if (debug) {
      console.log(
        `[AuthorizationCodeGrant] Loading user data for uid "${uid}"...`,
      );
    }
    user = await loadUserData(uid, userRegistry);
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

  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Loaded user data for uid "${uid}": `,
      user,
    );
  }

  const audience: string | readonly string[] = body.audience;
  try {
    if (debug) {
      console.log(
        `[AuthorizationCodeGrant] Validating token audience(s): `,
        audience,
      );
    }

    const isValidAudience: boolean = await validateAudience(
      uid,
      body.client_app_id,
      audience,
      dbh,
      debug satisfies boolean,
    );
    if (!isValidAudience) {
      console.error(
        "[AuthorizationCodeGrant] Invalid token audience for authorization code grant",
      );
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: "Invalid token audience",
        } satisfies RequestTokensResult,
        {
          status: 403,
        },
      );
    }
  } catch (e: unknown) {
    console.error(
      "[handleAuthorizationCodeGrant] Failed to validate token audience: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to validate token audience",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
  /**
   * TOKENS VALIDATED
   */
  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Token audience(s) appear valid, creating json web token factory...`,
    );
  }

  // Load organizations that user is associated with
  let user_organizations: readonly OrganizationID[];
  try {
    user_organizations = await orgRegistry.listUserOrganizationMemberships(
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

  if (!Array.isArray(user_organizations) || !user_organizations.every((org) => typeof org === "string" && organizationIdSchema.safeParse(org).success)) {
    throw new TypeError("'user_organizations' must be an array of valid organization IDs, received bad value from organizations registry!");
  }

  let jwt_keys_manager: AuthServerJwtKeysManager;
  try {
    jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db);
    if (!(await jwt_keys_manager.hasBeenInitialized())) {
      await jwt_keys_manager.performSetupTasks();
    }
  } catch (e: unknown) {
    console.error("Failed to initialize JWT key manager: ", e);
    throw new Error("Failed to initialize JWT key manager");
  }

  if (debug) {
    console.log(`[AuthorizationCodeGrant] Generating JWTs with JWT_Factory...`);
  }

  try {
    const generate_refresh = true as const;
    const tokenGenerationResult: RequestTokensResult =
      await generateTokensForAuthenticatedUser({
        user,
        client_app_id: body.client_app_id,
        user_organizations,
        environment,
        audiences: typeof audience === "string" ? [audience] : audience,
        generate_refresh,
        auth_jwt_manager: jwt_keys_manager,
      });

    if (!tokenGenerationResult.success || tokenGenerationResult.error) {
      throw new Error(tokenGenerationResult.message);
    }

    if (debug) {
      console.log(
        `[AuthorizationCodeGrant] Generated JWTs successfully! Sending response to frontend client...`,
      );
      if (environment === "development") {
        console.log(tokenGenerationResult.tokens);
      }
    }

    const isHttpsOnly: boolean =
      environment !== "development" && environment !== "test";
    return (await returnGeneratedTokensToUser({
      req,
      tokenGenerationResult,
      secure: isHttpsOnly,
      hostname: getHostname(req),
      debug,
    })) satisfies NextResponse;
  } catch (e: unknown) {
    console.error("Failed to generate jwt auth tokens: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate jwt auth tokens",
        error: true,
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
}

export default handleAuthorizationCodeGrant;
