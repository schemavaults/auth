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
import { appIdSchema, getAppEnvironment, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";
import setAuthServerRefreshTokenCookie from "@/lib/setAuthServerRefreshTokenCookie";
import { doesRequestHaveValidAuthServerRefreshToken } from "@/lib/doesRequestHaveValidAuthServerRefreshToken";
import sendVerificationEmail from "@/lib/send-verification-email";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/auth/register";

export interface HandleRegisterOptions {
  body: unknown;
  req: NextRequest;
}

// POST body for /api/auth/register
const registerBodySchema = z
  .object({
    credentials: emailCredentialsSchema,
    invite_code: z.string().min(8).optional(),
    client_app_id: appIdSchema,
    code_challenge: PKCE_ProofKeyManager.codeChallengeSchema,
    challenge_time: z.number().nonnegative(),
    // OAuth2 `redirect_uri` to bind to the issued authorization code.
    // Required for third-party app flows; null/absent only for the auth
    // server's own /account flow (client_app_id === auth-server's own).
    redirect_uri: z.string().url().nullable().optional(),
  })
  .required({
    credentials: true,
    client_app_id: true,
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

  // Prevent registration when already signed in — a new account always creates a new uid,
  // so it can never match the existing session and would cause a PKCE session mismatch.
  const existingSession = await doesRequestHaveValidAuthServerRefreshToken(req);
  if (existingSession) {
    console.warn(
      `[handleRegister] Blocked registration attempt: user '${existingSession.uid}' is already signed in`,
    );
    return NextResponse.json(
      {
        kind: "failure",
        success: false,
        message: "You are already signed in. Please log out before registering a new account.",
      } satisfies AuthenticateResult,
      {
        status: 403,
      },
    );
  }

  // Get values from registration data
  const email_credentials = registrationData.credentials;
  const client_app_id = registrationData.client_app_id;
  const code_challenge: string = registrationData.code_challenge;
  const challenge_time: number = registrationData.challenge_time;
  const invite_code: string | undefined = registrationData.invite_code;
  const redirect_uri: string | null = registrationData.redirect_uri ?? null;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // OAuth2 redirect_uri allowlist check. Refuse to mint a code if a
  // redirect_uri was supplied but is not registered for the requesting
  // client_app_id. For the auth server's own /account flow there is no
  // third-party redirect_uri to bind, so null is accepted only for the
  // hardcoded auth-server app_id.
  {
    const appEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
    if (redirect_uri !== null) {
      const allowed = await isRedirectUriRegisteredForClientApp({
        redirect_uri,
        client_app_id,
        environment: appEnv,
        dbh,
      });
      if (!allowed) {
        return NextResponse.json(
          {
            kind: "failure",
            success: false,
            message: "redirect_uri is not registered for this client_app_id",
          } satisfies AuthenticateResult,
          { status: 400 },
        );
      }
    } else if (client_app_id !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      return NextResponse.json(
        {
          kind: "failure",
          success: false,
          message: "redirect_uri is required for this client_app_id",
        } satisfies AuthenticateResult,
        { status: 400 },
      );
    }
  }

  // Details on invite code
  let inviteCodeRequired: boolean;
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.inviteCodesRequired",
      route: ROUTE,
    });
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
          kind: "failure",
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
          kind: "failure",
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
            kind: "failure",
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.createUserRegistry",
      route: ROUTE,
    });
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
      await captureServerException(dbh.db, e, {
        op_name: "handleRegister.lookupInviteCode",
        route: ROUTE,
      });
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.getUserByEmail",
      route: ROUTE,
    });
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
        kind: "failure",
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.createUser",
      route: ROUTE,
    });
    return NextResponse.json(
      {
        kind: "failure",
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

  // Fire off a verification email so the user can confirm their email address.
  // Wrapped in try/catch so registration never fails due to email-send errors.
  try {
    const rawToken: string = await userRegistry.createEmailVerificationToken(newUser.uid);
    await sendVerificationEmail({
      email,
      rawToken,
      db: dbh.db,
    });
    if (debug) {
      console.log(`[handleRegister] Verification email sent to: ${email}`);
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.sendVerificationEmail",
      route: ROUTE,
      uid: newUser.uid,
      context: { nonFatal: true },
    });
  }

  let authorization_code: string;
  try {
    authorization_code = await userRegistry.generateAuthorizationCode(
      newUser.uid satisfies string,
      client_app_id,
      code_challenge,
      "S256",
      challenge_time,
      redirect_uri,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.generateAuthorizationCode",
      route: ROUTE,
      uid: newUser.uid,
      context: { client_app_id },
    });
    return NextResponse.json(
      {
        kind: "failure",
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
      kind: "authenticated",
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
    await captureServerException(dbh.db, e, {
      op_name: "handleRegister.setAuthServerRefreshTokenCookie",
      route: ROUTE,
      uid: newUser.uid,
      context: { nonFatal: true },
    });
  }

  return response;
}

export default handleRegister;
