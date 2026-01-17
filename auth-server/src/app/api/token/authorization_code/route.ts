import "server-only";
import {
  type RequestTokensResult,
  authorizationCodePOSTbody,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import handleAuthorizationCodeGrant from "./authorization_code_grant";
import {
  OrganizationsRegistry,
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";

const grant_type = 'authorization_code' as const;

/**
 * Acquire a token using an authorization code
 *
 * This endpoint is used to exchange an authorization code for a refresh token and an access token.
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);
  if (debug) {
    console.log(`${req.method} => /api/token/authorization_code`);
  }

  const schema =
    authorizationCodePOSTbody

  // Ensure body is valid JSON
  let body: z.infer<typeof schema>;
  try {
    body = await schema.parseAsync(await req.json());
  } catch (e: unknown) {
    if (debug) {
      console.error("Invalid body JSON: ", e);
    }
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Invalid body JSON",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  if (body.grant_type !== grant_type) {
    console.error(`Mismatched grant type, expected '${grant_type}'`);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Mismatched grant type",
      } satisfies RequestTokensResult,
      {
        status: 400,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to user registry: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to user registry",
      },
      {
        status: 500,
      },
    );
  }

  let orgRegistry: OrganizationsRegistry;
  try {
    orgRegistry = new OrganizationsRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to organizations registry: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to organizations registry",
      },
      {
        status: 500,
      },
    );
  }

  return await handleAuthorizationCodeGrant(
    req,
    body,
    userRegistry,
    orgRegistry,
    dbh,
    environment satisfies SchemaVaultsAppEnvironment,
    debug satisfies boolean,
  );
}

export const dynamic = "force-dynamic"; // defaults to auto
