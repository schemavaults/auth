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
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  RefreshTokenCookieName,
  RefreshTokenExpiryCookieName,
} from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getStringByteSize from "@schemavaults/auth-server-sdk/getStringByteSize";
import MaximumBrowserCookieSize from "@/lib/MaximumBrowserCookieSize";
import {
  handleCorsPreflightForClientApp,
  validateCorsForClientApp,
  applyCorsHeadersToResponse,
} from "@/lib/cors/cors-for-client-app";

const grant_type = "refresh_token" as const;

type RequestCookies = NextRequest["cookies"];
type RequestHeaders = NextRequest["headers"];

async function extractRefreshToken(
  client_app_id: AppId,
  cookies: RequestCookies,
  headers: RequestHeaders
): Promise<string> {
  const refresh_token_cookie_name = RefreshTokenCookieName(client_app_id);
  const refresh_token_expiry_cookie_name =
    RefreshTokenExpiryCookieName(client_app_id);
  if (
    cookies.has(refresh_token_cookie_name) &&
    cookies.has(refresh_token_expiry_cookie_name)
  ) {
    const refresh_token_cookie: string | undefined =
      cookies.get(refresh_token_cookie_name)?.value;
    if (!refresh_token_cookie) {
      throw new Error(
        `Refresh token cookie '${RefreshTokenCookieName}' appears to be empty!`
      );
    }
    return refresh_token_cookie;
  } else if (headers.has("Authorization")) {
    const auth_header: string | null = headers.get("Authorization");
    if (!auth_header || typeof auth_header !== "string") {
      throw new Error(
        "Expected 'Authorization' to be non-empty string if set."
      );
    }
    if (!auth_header.startsWith("Bearer ")) {
      throw new Error("Expected header 'Authorization' to start with 'Bearer '");
    }
    const refresh_token_from_header: string =
      typeof auth_header === "string" && auth_header.startsWith("Bearer ")
        ? auth_header.slice("Bearer ".length)
        : "";
    if (!refresh_token_from_header) {
      throw new Error(
        `Refresh token cookie from header 'Authorization' appears to be empty!`
      );
    }
    return refresh_token_from_header;
  } else {
    throw new Error(
      "Neither cookies nor header appear to contain a refresh token!"
    );
  }
}

/**
 * Handle CORS preflight requests for the refresh_token endpoint
 */
export async function OPTIONS(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/token/refresh_token/[client_app_id]">
): Promise<NextResponse> {
  const params = await ctx.params;
  if (!appIdSchema.safeParse(params.client_app_id).success) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 }
    );
  }
  await using dbh = ServerlessDatabase.createDBH();
  return handleCorsPreflightForClientApp(
    params.client_app_id as AppId,
    req,
    dbh
  );
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
  ctx: RouteContext<"/api/auth/token/refresh_token/[client_app_id]">
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const params = await ctx.params;
  const url_client_app_id = params.client_app_id as AppId;

  if (debug) {
    console.log(
      `${req.method} => /api/auth/token/refresh_token/${url_client_app_id}`
    );
  }

  // Validate client_app_id from URL
  if (!appIdSchema.safeParse(url_client_app_id).success) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Invalid client_app_id in URL",
      } satisfies RequestTokensResult,
      { status: 400 }
    );
  }

  const schema = refreshTokenPOSTbody;

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
      { status: 400 }
    );
  }

  // Verify URL client_app_id matches body client_app_id
  if (url_client_app_id !== body.client_app_id) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message:
          "client_app_id in URL does not match client_app_id in request body",
      } satisfies RequestTokensResult,
      { status: 400 }
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
      { status: 400 }
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // Validate CORS
  const corsResult = await validateCorsForClientApp(
    { client_app_id: url_client_app_id, request: req },
    dbh
  );

  if (!corsResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: corsResult.error,
      } satisfies RequestTokensResult,
      { status: 403 }
    );
  }

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
      { status: 500 }
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
      { status: 500 }
    );
  }

  const client_app_id: AppId = body.client_app_id;

  let unvalidated_refresh_token: string;
  try {
    unvalidated_refresh_token = await extractRefreshToken(
      client_app_id,
      req.cookies,
      req.headers
    );
    if (typeof unvalidated_refresh_token !== "string") {
      throw new TypeError(
        "Expected the result of extractRefreshToken to be a string!"
      );
    }
  } catch (e: unknown) {
    console.error(
      "Failed to extract refresh token from request cookies or 'Authorization' header: ",
      e
    );
    return NextResponse.json(
      {
        success: false,
        error: true,
        message:
          "Failed to extract refresh token from request cookies or 'Authorization' header",
      } satisfies RequestTokensResult,
      { status: 401 }
    );
  }

  const refreshTokenSize: number = getStringByteSize(unvalidated_refresh_token);
  if (refreshTokenSize > MaximumBrowserCookieSize) {
    console.error(
      `Refresh token exceeded maximum size: ${refreshTokenSize} bytes > ${MaximumBrowserCookieSize} bytes`
    );
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Refresh token exceeded maximum size.",
      } satisfies RequestTokensResult,
      { status: 500 }
    );
  }

  let response: NextResponse;
  try {
    response = await handleRefreshTokenGrant(
      req,
      unvalidated_refresh_token,
      body,
      userRegistry,
      orgRegistry,
      dbh,
      environment satisfies SchemaVaultsAppEnvironment,
      debug satisfies boolean
    );
  } catch (e: unknown) {
    console.error("Failed to run refresh token grant handler: ", e);
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: "Failed to run refresh token grant handler",
      } satisfies RequestTokensResult,
      { status: 500 }
    );
  }

  // Apply CORS headers to response if needed
  return applyCorsHeadersToResponse(response, url_client_app_id, req, dbh);
}

export const dynamic = "force-dynamic";
