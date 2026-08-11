import "server-only";
import {
  type RequestTokensResult,
  createAuthorizationCodePOSTBodySchema,
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
  type CorsValidationResult,
  handleCorsPreflightForClientApp,
  validateCorsForClientApp,
  applyCorsHeadersFromResult,
} from "@/lib/cors/cors-for-client-app";
import {
  authenticateTokenEndpointClient,
  parseBasicClientCredentials,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
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

  // Validate client_app_id from URL. Checked before CORS validation because
  // the CORS allowance is keyed on this value; if it's malformed there is
  // nothing to look up. The browser's preflight would have failed for the
  // same reason, so the missing CORS headers here only affect non-browser
  // callers.
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

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // Validate CORS up-front so every subsequent response — error or success —
  // carries the same allowance. Without CORS headers on error responses, the
  // browser blocks JS from reading them and the failure surfaces as a
  // generic CORS error instead of the actual cause.
  const corsResult: CorsValidationResult = await validateCorsForClientApp(
    { client_app_id: url_client_app_id, request: req },
    dbh,
    debug
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

  const withCors = <R extends NextResponse>(response: R): R =>
    applyCorsHeadersFromResult(response, corsResult);

  const schema = createAuthorizationCodePOSTBodySchema(z, environment);

  // Ensure body is valid JSON
  let body: z.infer<typeof schema>;
  try {
    body = await schema.parseAsync(await req.json());
  } catch (e: unknown) {
    if (debug) {
      console.error("Invalid body JSON: ", e);
    }
    return withCors(NextResponse.json(
      {
        success: false,
        error: true,
        message: "Invalid body JSON",
      } satisfies RequestTokensResult,
      { status: 400 }
    ));
  }

  // Verify URL client_app_id matches body client_app_id
  if (url_client_app_id !== body.client_app_id) {
    return withCors(NextResponse.json(
      {
        success: false,
        error: true,
        message:
          "client_app_id in URL does not match client_app_id in request body",
      } satisfies RequestTokensResult,
      { status: 400 }
    ));
  }

  if (body.grant_type !== grant_type) {
    console.error(`Mismatched grant type, expected '${grant_type}'`);
    return withCors(NextResponse.json(
      {
        success: false,
        error: true,
        message: "Mismatched grant type",
      } satisfies RequestTokensResult,
      { status: 400 }
    ));
  }

  // Confidential clients (apps with a registered client secret) must
  // authenticate on every token request; this surface redeems the same
  // authorization codes as /api/oidc/token, so skipping the check here
  // would let anyone bypass client authentication entirely.
  const basic_credentials = parseBasicClientCredentials(
    req.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return withCors(NextResponse.json(
      {
        success: false,
        error: true,
        message: "Malformed Basic Authorization header",
      } satisfies RequestTokensResult,
      { status: 400 }
    ));
  }
  const clientAuth = await authenticateTokenEndpointClient({
    db: dbh.db,
    client_app_id: url_client_app_id,
    basic_credentials,
    post_client_secret: body.client_secret ?? null,
  });
  if (!clientAuth.ok) {
    return withCors(NextResponse.json(
      {
        success: false,
        error: true,
        message: clientAuth.error_description,
      } satisfies RequestTokensResult,
      { status: clientAuth.status }
    ));
  }

  let userRegistry: UserRegistry;
  try {
    userRegistry = new UserRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to user registry: ", e);
    return withCors(NextResponse.json(
      {
        success: false,
        message: "Failed to connect to user registry",
      },
      { status: 500 }
    ));
  }

  let orgRegistry: OrganizationsRegistry;
  try {
    orgRegistry = new OrganizationsRegistry(dbh.db, debug satisfies boolean);
  } catch (e: unknown) {
    console.error("Failed to connect to organizations registry: ", e);
    return withCors(NextResponse.json(
      {
        success: false,
        message: "Failed to connect to organizations registry",
      },
      { status: 500 }
    ));
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

  return withCors(response);
}

export const dynamic = "force-dynamic";
