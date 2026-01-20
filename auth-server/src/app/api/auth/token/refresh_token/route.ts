import "server-only";
import {
  type RequestTokensResult,
  refreshTokenPOSTbody,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import handleRefreshTokenGrant from "./refresh_token_grant";
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
import { RefreshTokenCookieName, RefreshTokenExpiryCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";

const grant_type = 'refresh_token' as const;

async function extractRefreshToken(req: NextRequest): Promise<string> {
  const { cookies, headers } = req;
  if (cookies.has(RefreshTokenCookieName) && cookies.has(RefreshTokenExpiryCookieName)) {
    const refresh_token_cookie: string | undefined = cookies.get(RefreshTokenCookieName)?.value;
    if (!refresh_token_cookie) {
      throw new Error(`Refresh token cookie '${RefreshTokenCookieName}' appears to be empty!`)
    }
    return refresh_token_cookie;
  } else if (headers.has('Authorization')) {
    const auth_header: string | null = headers.get("Authorization");
    if (!auth_header || typeof auth_header !== 'string') {
      throw new Error("Expected 'Authorization' to be non-empty string if set.")
    }
    if (!auth_header.startsWith("Bearer ")) {
      throw new Error("Expected header 'Authorization' to start with 'Bearer '");
    }
    const refresh_token_from_header: string =
      typeof auth_header === "string" && auth_header.startsWith("Bearer ")
        ? auth_header.slice("Bearer ".length)
        : "";
    if (!refresh_token_from_header) {
      throw new Error(`Refresh token cookie from header 'Authorization' appears to be empty!`)
    }
    return refresh_token_from_header;
  } else {
    throw new Error("Neither cookies nor header appear to contain a refresh token!");
  }
}

/**
 * Acquire a token using a refresh token
 *
 * This endpoint is used to exchange a refresh token for a fresh refresh token and an access token.
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
    console.log(`${req.method} => /api/auth/token/refresh_token`);
  }

  const schema =
    refreshTokenPOSTbody;

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

  let unvalidated_refresh_token: string;
  try {
    unvalidated_refresh_token = await extractRefreshToken(req);
    if (typeof unvalidated_refresh_token !== 'string') {
      throw new TypeError("Expected the result of extractRefreshToken to be a string!")
    }
  } catch (e: unknown) {
    console.error("Failed to extract refresh token from request cookies or 'Authorization' header: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to extract refresh token from request cookies or 'Authorization' header",
      } satisfies RequestTokensResult,
      {
        status: 401,
      },
    );
  }

  if (getStringByteSize(unvalidated_refresh_token) > MaximumBrowserCookieSize) {
    console.error("Refresh token exceeded maximum size.");
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Refresh token exceeded maximum size.",
      } satisfies RequestTokensResult,
      {
        status: 401,
      },
    );
  }

  try {
    return await handleRefreshTokenGrant(
      req,
      unvalidated_refresh_token,
      body,
      userRegistry,
      orgRegistry,
      dbh,
      environment satisfies SchemaVaultsAppEnvironment,
      debug satisfies boolean,
    );
  } catch (e: unknown) {
    console.error("Failed to run refresh token grant handler: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to run refresh token grant handler",
      } satisfies RequestTokensResult,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
