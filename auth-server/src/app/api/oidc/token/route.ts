import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse, type NextRequest } from "next/server";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import {
  authenticateTokenEndpointClient,
  parseBasicClientCredentials,
  TOKEN_ENDPOINT_WWW_AUTHENTICATE,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import handleOidcAuthorizationCodeGrant from "./authorization_code_grant";
import handleOidcRefreshTokenGrant from "./refresh_token_grant";
import { CORS_HEADERS, type OidcTokenFormParam } from "./token-response";

const ROUTE = "/api/oidc/token";

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The OIDC token endpoint (RFC 6749 §3.2, form-encoded): exchanges an
 * authorization code (grant_type=authorization_code) or a scope-bearing
 * refresh token (grant_type=refresh_token) for the standard token
 * response — with the refresh token inlined and an id_token on the code
 * grant. Scope/nonce are first-class on every login flow, so any code
 * is redeemable here regardless of which surface initiated the login
 * (PKCE + client + redirect_uri binding are the security boundary, plus
 * client-secret authentication for confidential clients).
 *
 * This module owns the shared request plumbing (form parsing,
 * grant_type dispatch, client_id validation, client authentication,
 * exception capture); the per-grant logic lives in
 * ./authorization_code_grant.ts and ./refresh_token_grant.ts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  }
  const param: OidcTokenFormParam = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const grant_type = param("grant_type");
  if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
    return oidcTokenErrorResponse(
      "unsupported_grant_type",
      "grant_type must be 'authorization_code' or 'refresh_token'.",
    );
  }

  const basic_credentials = parseBasicClientCredentials(
    request.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Malformed Basic Authorization header.",
    );
  }

  // client_secret_basic clients may identify themselves solely through
  // the Authorization header (RFC 6749 §2.3.1); fall back to it when
  // the form omits client_id.
  const parsed_client_id = appIdSchema.safeParse(
    param("client_id") ?? basic_credentials?.client_id ?? null,
  );
  if (!parsed_client_id.success) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing or malformed 'client_id' parameter.",
    );
  }
  const client_app_id: AppId = parsed_client_id.data;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    const clientAuth = await authenticateTokenEndpointClient({
      db: dbh.db,
      client_app_id,
      basic_credentials,
      post_client_secret: param("client_secret"),
    });
    if (!clientAuth.ok) {
      return oidcTokenErrorResponse(
        clientAuth.error,
        clientAuth.error_description,
        clientAuth.status,
        clientAuth.status === 401
          ? { "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE }
          : {},
      );
    }

    if (grant_type === "authorization_code") {
      return await handleOidcAuthorizationCodeGrant(
        dbh,
        param,
        client_app_id,
        environment,
        debug,
      );
    }
    return await handleOidcRefreshTokenGrant(
      dbh,
      param,
      client_app_id,
      environment,
      debug,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcToken.POST",
      route: ROUTE,
      context: { client_app_id, grant_type },
    });
    return oidcTokenErrorResponse(
      "invalid_request",
      "Failed to process the token request.",
      500,
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
