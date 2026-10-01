import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { TOKEN_ENDPOINT_WWW_AUTHENTICATE } from "@/lib/oauth2/authenticate-token-endpoint-client";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import {
  authenticateIntrospectionCaller,
  introspectOidcToken,
  parseIntrospectionRequest,
  type AuthenticateIntrospectionCallerResult,
  type IntrospectionClientCredentials,
  type IntrospectionRequestError,
  type OidcIntrospectionResponseBody,
  type ParseIntrospectionRequestResult,
} from "@/lib/oidc/introspection";
import { INTROSPECTION_CORS_HEADERS } from "./cors";

const ROUTE = "/api/oidc/introspect";

/**
 * RFC 6749 §5.2: `invalid_client` is a 401 with a `WWW-Authenticate`
 * challenge (Basic is advertised on every 401 so clients know the scheme
 * is available); `invalid_request` a 400.
 */
function introspectionErrorResponse({
  error,
  error_description,
}: IntrospectionRequestError): NextResponse {
  return error === "invalid_client"
    ? oidcTokenErrorResponse(error, error_description, 401, {
        "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE,
      })
    : oidcTokenErrorResponse(error, error_description, 400);
}

function clientIdOf(credentials: IntrospectionClientCredentials): string | null {
  return credentials.method === "client_secret"
    ? credentials.client_app_id
    : credentials.client_id;
}

/**
 * The OAuth 2.0 token introspection endpoint (RFC 7662), advertised as
 * `introspection_endpoint` in the discovery document. Two kinds of caller
 * may introspect, and each sees only its own tokens:
 *
 *  - a confidential client (an app with a registered client secret) POSTs
 *    a token it was issued by the OIDC surface — access or refresh;
 *  - an API server POSTs an access token minted for it, authenticating
 *    with `private_key_jwt`: a JWKS access assertion signed with its JWKS
 *    access key.
 *
 * The caller learns whether the token is currently active, plus its
 * metadata when it is. The steps live in `@/lib/oidc/introspection`:
 * parse the request, authenticate the caller (§2.1 requires the endpoint
 * to be authorized), then introspect.
 */
export async function handleOidcIntrospectRequest(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  const parsed: ParseIntrospectionRequestResult =
    await parseIntrospectionRequest(request);
  if (!parsed.ok) {
    return introspectionErrorResponse(parsed.error);
  }
  const { token, credentials } = parsed.request;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    const authentication: AuthenticateIntrospectionCallerResult =
      await authenticateIntrospectionCaller(dbh.db, credentials);
    if (!authentication.ok) {
      return introspectionErrorResponse(authentication.error);
    }

    const body: OidcIntrospectionResponseBody = await introspectOidcToken({
      dbh,
      token,
      caller: authentication.caller,
      environment,
    });
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...INTROSPECTION_CORS_HEADERS,
      },
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcIntrospect.POST",
      route: ROUTE,
      context: {
        client_id: clientIdOf(credentials),
        client_authentication: credentials.method,
      },
    });
    return oidcTokenErrorResponse(
      "server_error",
      "Failed to process the introspection request.",
      500,
    );
  }
}
