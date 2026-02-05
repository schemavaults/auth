import "server-only";
import {
  type RequestTokensResult,
  authorizationCodePOSTbody,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
  handleCorsPreflightForClientApp,
  validateCorsForClientApp,
  applyCorsHeadersToResponse,
} from "@/lib/cors/cors-for-client-app";
import handleAuthorizationCodeGrant from "./authorization_code_grant";

const grant_type = "authorization_code" as const;

/**
 * Handle CORS preflight requests for the authorization_code token endpoint
 */
export async function OPTIONS(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/token/authorization_code/[client_app_id]">
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
 * Acquire a token using an authorization code
 *
 * This endpoint is used to exchange an authorization code for a refresh token and an access token.
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/auth/token/authorization_code/[client_app_id]">
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const params = await ctx.params;
  const url_client_app_id = params.client_app_id as AppId;

  if (debug) {
    console.log(
      `${req.method} => /api/auth/token/authorization_code/${url_client_app_id}`
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

  const schema = authorizationCodePOSTbody;

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

  const response = await handleAuthorizationCodeGrant(
    req,
    body,
    userRegistry,
    orgRegistry,
    dbh,
    environment satisfies SchemaVaultsAppEnvironment,
    debug satisfies boolean
  );

  // Apply CORS headers to response if needed
  return applyCorsHeadersToResponse(response, url_client_app_id, req, dbh);
}

export const dynamic = "force-dynamic";
