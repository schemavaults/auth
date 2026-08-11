import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse, type NextRequest } from "next/server";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import {
  authenticateTokenEndpointClient,
  parseBasicClientCredentials,
  TOKEN_ENDPOINT_WWW_AUTHENTICATE,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import {
  introspectOidcToken,
  type OidcIntrospectionResponseBody,
} from "@/lib/oidc/introspect-token";

const ROUTE = "/api/oidc/introspect";

// CORS: introspection is a server-to-server surface (it requires a
// client secret, which never belongs in a browser), but the wildcard
// mirrors the rest of the OIDC surface — and the shared error helper
// already emits Access-Control-Allow-Origin: * — so dev tooling can
// still exercise the endpoint from a browser context.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The OAuth 2.0 token introspection endpoint (RFC 7662), advertised as
 * `introspection_endpoint` in the discovery document. A confidential
 * client (an app with a registered client secret) POSTs a token it was
 * issued by the OIDC surface — access or refresh — and learns whether
 * the token is currently active, plus its metadata when it is.
 *
 * §2.1 requires the endpoint to be authorized: client authentication
 * uses the same client_secret_basic / client_secret_post machinery as
 * the token endpoint. Public (PKCE-only) clients have no credentials to
 * authenticate with and are rejected — accepting anonymous callers
 * would open the endpoint to token scanning.
 *
 * The optional `token_type_hint` parameter (§2.1) is accepted but
 * deliberately unused: the token kind is determined from the token
 * itself (the audience named in its header), so the hint can never
 * change the outcome.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  }
  const param = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  // RFC 7662 §2.1: `token` is the one REQUIRED parameter; omitting it
  // is a 400, not an inactive-token 200.
  const token = param("token");
  if (!token) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'token' parameter.",
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
  // the form omits client_id. A request identifying no client at all is
  // an authentication failure (§2.3 → RFC 6749 §5.2 401), since this
  // endpoint accepts no anonymous callers.
  const raw_client_id: string | null =
    param("client_id") ?? basic_credentials?.client_id ?? null;
  if (raw_client_id === null) {
    return oidcTokenErrorResponse(
      "invalid_client",
      "Client authentication is required to introspect tokens (client_secret_basic or client_secret_post).",
      401,
      { "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE },
    );
  }
  const parsed_client_id = appIdSchema.safeParse(raw_client_id);
  if (!parsed_client_id.success) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Malformed 'client_id' parameter.",
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
    if (!clientAuth.confidential) {
      return oidcTokenErrorResponse(
        "invalid_client",
        "Token introspection requires a confidential client; register a client secret for this app.",
        401,
        { "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE },
      );
    }

    const body: OidcIntrospectionResponseBody = await introspectOidcToken({
      dbh,
      token,
      client_app_id,
      environment,
    });
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...CORS_HEADERS,
      },
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcIntrospect.POST",
      route: ROUTE,
      context: { client_app_id },
    });
    return oidcTokenErrorResponse(
      "invalid_request",
      "Failed to process the introspection request.",
      500,
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
