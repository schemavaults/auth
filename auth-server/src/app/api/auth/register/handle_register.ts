import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import type {
  AuthenticateResult,
  InviteCode,
  InviteCodeDefinition,
} from "@schemavaults/auth-common";
import { z } from "zod";
import {
  emailCredentialsSchema,
  inviteCodeFormatSchema,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import {
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import shouldCreateAsSuperuser from "./shouldCreateAsSuperuser";
import lookupInviteCode from "@/lib/auth-db/users/lookup-invite-code";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import setAuthServerRefreshTokenCookie from "@/lib/setAuthServerRefreshTokenCookie";

export interface HandleRegisterOptions {
  body: unknown;
  req: NextRequest;
}

// POST body for /api/auth/register
const registerBodySchema = z
  .object({
    credentials: emailCredentialsSchema,
    invite_code: z.string().min(8).optional(),
    code_challenge: PKCE_ProofKeyManager.codeChallengeSchema,
    challenge_time: z.number().nonnegative(),
  })
  .required({
    credentials: true,
    code_challenge: true,
    challenge_time: true,
  })
  .strict();

function wasInviteCodeSupplied(
  invite_code: InviteCode | undefined,
): invite_code is InviteCode {
  if (typeof invite_code === "string" && !!invite_code) {
    return true;
  }
  return false;
}

export async function handleRegister({
  body,
  req,
}: HandleRegisterOptions, debug: boolean = false): Promise<NextResponse> {
  if (debug) {
    console.log(
      `[handleRegister] Received register request!`,
    );
  }

  // Get registration data from request body
  const parse_register_body = await registerBodySchema.safeParseAsync(body);
  if (!parse_register_body.success) {
    if (debug) {
      console.error(parse_register_body.error);
    }
    return NextResponse.json(parse_register_body.error, { status: 400 });
  }
  const registrationData = parse_register_body.data;
  if (debug) {
    console.log("[handleRegister] Parsed register body: ", registrationData);
  }

  // Get values from registration data
  const email_credentials = registrationData.credentials;
  const code_challenge: string = registrationData.code_challenge;
  const challenge_time: number = registrationData.challenge_time;
  const invite_code: string | undefined = registrationData.invite_code;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // Details on invite code
  let inviteCodeRequired: boolean;
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({
      error: true,
      success: false,
      message: "Failed to check the 'invite_code_required' server configuration! Please try again later."
    }, {
      status: 500
    })
  }
  const inviteCodeSupplied: boolean = wasInviteCodeSupplied(invite_code);

  // Ensure an invite code was supplied if one is required!
  if (inviteCodeRequired) {
    if (!inviteCodeSupplied || typeof invite_code !== "string") {
      console.warn(
        "[handleRegister] Received register request without invite code-- an invite code is currently required!",
      );
      return NextResponse.json(
        {
          success: false,
          message: "An invite code is required!",
        } satisfies AuthenticateResult,
        {
          status: 400,
        },
      );
    } else {
      if (debug) {
        console.log("[handleRegister] Received invite code: ", invite_code);
      }
    }
  }

  // Validate format of invite code if one was supplied
  if (inviteCodeSupplied) {
    console.assert(
      typeof invite_code === "string" && !!invite_code,
      "Expected 'invite_code' to be a truthy string if inviteCodeSupplied = true!",
    );
    const parsed_invite_code =
      await inviteCodeFormatSchema.safeParseAsync(invite_code);
    if (!parsed_invite_code.success) {
      console.warn(
        "Received a registration request with an invite code in an invalid format!",
      );
      return NextResponse.json(
        {
          success: false,
          message: "Invalid format for invite code!",
        } satisfies AuthenticateResult,
        {
          status: 400,
        },
      );
    } else {
      // validated invite code successfully
      if (parsed_invite_code.data !== invite_code) {
        console.error(
          "Error parsing invite code: mismatch between input and parsed invite codes!",
        );
        return NextResponse.json(
          {
            success: false,
            message: "Error parsing invite code!",
          } satisfies AuthenticateResult,
          {
            status: 400,
          },
        );
      }
    }
  }

  if (debug && invite_code) {
    console.log(
      "[handleRegister] Received register request with valid invite code: ",
      invite_code,
    );
  }

  const email: string = email_credentials.email;
  const password: string = email_credentials.password;

  let userRegistry: UserRegistry;
  try {
    if (debug) {
      console.log(
        "[handleRegister] Loading SchemaVaults user registry database interface...",
      );
    }
    userRegistry = new UserRegistry(dbh.db, debug);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to connect to user registry",
      },
      {
        status: 500,
      },
    );
  }
  if (debug) {
    console.log("[handleRegister] Loaded UserRegistry database interface...");
  }

  const AS_ADMIN: boolean = (invite_code && typeof invite_code === 'string') ? shouldCreateAsSuperuser(invite_code) : false;
  if (typeof AS_ADMIN !== 'boolean') {
    throw new TypeError("Expected result of shouldCreateAsSuperuser to be a boolean!");
  }

  // Validate that invite code is valid / in database if one was supplied!
  if (wasInviteCodeSupplied(invite_code)) {
    console.assert(
      !!invite_code,
      "An invite code was expected to have been supplied if this point was reached (but 'invite_code' is falsy)!",
    );
    if (debug) {
      console.log(
        `[handleRegister] Checking if invite code '${invite_code}' exists...`,
      );
    }

    // Throw if invite code doesn't exist in database (and this isn't the superuser code from env vars)
    try {
      const inviteCodeDef: InviteCodeDefinition | null =
        await lookupInviteCode(dbh.db, invite_code, debug);

      // Supplied invite code was not found
      if (!inviteCodeDef && !AS_ADMIN) {
        // Invite code must exist in database in order to use it (except the admin code, which exists in env vars)
        return NextResponse.json(
          {
            success: false,
            message: "Invalid invite code; was not found in database",
            error: true
          },
          {
            status: 404,
          },
        );
      } else if (AS_ADMIN) {
        if (debug) {
          console.log(
            `[handleRegister] Invite code '${invite_code}' appears to be the superuser invite code!`
          );
        }
      }  else {
        // inviteCodeDef is truthy
        if (debug) {
          console.log(
            `[handleRegister] Invite code '${invite_code}' appears to exist in database: `,
            inviteCodeDef,
          );
        }
      }
    } catch (e: unknown) {
      console.error(
        "[handleRegister] Failed to check if invite code exists: ",
        e,
      );
      return NextResponse.json(
        {
          success: false,
          message: "Failed to check if invite code exists!",
        },
        {
          status: 500,
        },
      );
    }
  }

  if (debug) {
    console.log("[handleRegister] Checking if user already exists...");
  }

  // Check if email exists in db
  let user: UserDocument | null;
  try {
    user = await userRegistry.getUserByEmail(email);
  } catch (e: unknown) {
    console.error("Failed to query user by email: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to query user by email",
      },
      {
        status: 500,
      },
    );
  }

  if (!user && debug) {
    console.log("[handleRegistry] User does not appear to exist yet");
  }

  if (user) {
    return NextResponse.json(
      {
        success: false,
        message: "User already exists",
      } satisfies AuthenticateResult,
      {
        status: 409,
      },
    );
  }

  let newUser: UserDocument;
  try {
    if (debug) {
      console.log(
        `[handleRegister] Creating ${AS_ADMIN ? "admin" : "regular"} user with email:`,
        email,
      );
    }
    if (AS_ADMIN && !invite_code) {
      throw new TypeError("Expected 'invite_code' to be defined if AS_ADMIN flag has been set; presumably it was set by an invite code matching superuser environment variable")
    }

    newUser = await userRegistry.createUser({
      email,
      password,
      invite_code,
    });
  } catch (e: unknown) {
    console.error("[handleRegister] Failed to create user: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create user",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  if (typeof newUser.uid !== 'string') {
    throw new TypeError("Expected to receive the 'uid' from newly created user document")
  }

  let authorization_code: string;
  try {
    authorization_code = await userRegistry.generateAuthorizationCode(
      newUser.uid satisfies string,
      code_challenge,
      "S256",
      challenge_time,
    );
  } catch (e: unknown) {
    console.error("Failed to generate authorization code: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate authorization code",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }

  const response = NextResponse.json(
    {
      success: true,
      message: "User created successfully",
      authorization_code,
    } satisfies AuthenticateResult,
    {
      status: 200,
    },
  );

  // Set auth-server refresh token cookie so the user is authenticated
  // for subsequent requests (e.g. the OAuth2 consent screen).
  // Wrapped in try/catch so registration never fails due to cookie-setting errors.
  try {
    const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
    await setAuthServerRefreshTokenCookie({
      uid: newUser.uid,
      db: dbh.db,
      req,
      res: response,
      environment: appEnv,
      debug,
    });
  } catch (e: unknown) {
    console.error("[handleRegister] Failed to set auth-server refresh token cookie (non-fatal):", e);
  }

  return response;
}

export default handleRegister;
