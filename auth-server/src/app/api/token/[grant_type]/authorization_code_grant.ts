import { z } from "zod";
import { NextResponse } from "next/server";
import {
  type OrganizationID,
  type RequestTokensResult,
  type UserData,
  type authorizationCodePOSTbody,
} from "@schemavaults/auth-common";
import { JWT_Factory, JWT_Keys } from "@schemavaults/jwt";
import {
  type ServerlessDatabase,
  type UserRegistry,
  type OrganizationsRegistry,
  loadUserData,
} from "@/lib/auth-db";
import { validateAudience } from "./validate-audience";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

export async function handleAuthorizationCodeGrant(
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
    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
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
    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
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
    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
      console.log(`[AuthorizationCodeGrant] Validating token audience(s)...`);
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
        message: "Failed to validate token audience",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  if (debug) {
    console.log(
      `[AuthorizationCodeGrant] Token audience(s) appear valid, creating json web token factory...`,
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

  let jwt_factory: JWT_Factory;
  try {
    jwt_factory = new JWT_Factory({
      user,
      client_app_id: body.client_app_id,
      jwt_keys: await JWT_Keys.init(),
      user_organizations,
      environment,
    });
  } catch (e: unknown) {
    console.error(
      "[AuthorizationCodeGrant] Failed to init token generator: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to initialize token generator",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }

  if (debug) {
    console.log(`[AuthorizationCodeGrant] Generating JWTs with JWT_Factory...`);
  }

  try {
    const generateRefresh = true as const;
    const tokens = (
      await jwt_factory.generateTokens(body.audience, generateRefresh)
    ).tokens;

    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
      console.log(
        `[AuthorizationCodeGrant] Generated JWTs successfully! Sending response to frontend client...`,
      );
      if (environment === "development") {
        console.log(tokens);
      }
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
    console.error("Failed to generate jwt auth tokens: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate jwt auth tokens",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
}
