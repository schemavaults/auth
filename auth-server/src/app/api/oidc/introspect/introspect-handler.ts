import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiServerIdSchema,
  appIdSchema,
  getAppEnvironment,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE } from "@schemavaults/auth-common";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  authenticateTokenEndpointClient,
  parseBasicClientCredentials,
  TOKEN_ENDPOINT_WWW_AUTHENTICATE,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import {
  introspectOidcToken,
  type OidcIntrospectionCaller,
  type OidcIntrospectionResponseBody,
} from "@/lib/oidc/introspection";

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

/** CORS preflight. */
export async function handleOidcIntrospectPreflight(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The issuer (`iss`) of a client assertion, read WITHOUT verifying it: it
 * only names the API server whose JWKS access key the assertion is then
 * verified against. Returns null when the assertion is not a JWT with a
 * string `iss`.
 */
function getUnverifiedAssertionIssuer(assertion: string): string | null {
  const parts: string[] = assertion.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "iss" in payload &&
      typeof payload.iss === "string"
    ) {
      return payload.iss;
    }
  } catch {
    // Not a JWT.
  }
  return null;
}

function invalidClientResponse(error_description: string): NextResponse {
  return oidcTokenErrorResponse("invalid_client", error_description, 401, {
    "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE,
  });
}

type ClientAuthenticationOutcome =
  | { ok: true; caller: OidcIntrospectionCaller }
  | { ok: false; response: NextResponse };

/**
 * `private_key_jwt` (RFC 7523 §2.2) for API servers: the assertion is a
 * JWKS access proof token (`createJwksAccessProofToken()` from
 * @schemavaults/jwt) signed with the API server's JWKS access key — `iss` =
 * `sub` = the API server id, `aud` = the auth server URL (the issuer),
 * single-use `jti`, 60s lifetime. `client_id`, when sent, must name the same
 * API server (RFC 7521 §4.2).
 */
async function authenticateApiServer(
  dbh: ServerlessDatabase,
  client_assertion: string,
  raw_client_id: string | null,
): Promise<ClientAuthenticationOutcome> {
  const issuer: string | null = getUnverifiedAssertionIssuer(client_assertion);
  const parsed_api_server_id = apiServerIdSchema.safeParse(issuer);
  if (!parsed_api_server_id.success) {
    return {
      ok: false,
      response: invalidClientResponse(
        "The client assertion must be a JWT whose 'iss' is the API server id.",
      ),
    };
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;
  if (raw_client_id !== null && raw_client_id !== api_server_id) {
    return {
      ok: false,
      response: invalidClientResponse(
        "The client assertion's issuer does not match the request's client_id.",
      ),
    };
  }
  // The auth server never holds a JWKS access key (its key management
  // endpoints refuse it).
  if (
    api_server_id === getAuthServerAppId() ||
    !(await verifyJwksAccessAssertion(client_assertion, api_server_id, dbh.db))
  ) {
    return {
      ok: false,
      response: invalidClientResponse("Invalid client assertion."),
    };
  }
  return { ok: true, caller: { kind: "api_server", api_server_id } };
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
 *    access key (see {@link authenticateApiServer}).
 *
 * The caller learns whether the token is currently active, plus its
 * metadata when it is.
 *
 * §2.1 requires the endpoint to be authorized: client apps authenticate
 * with the same client_secret_basic / client_secret_post machinery as the
 * token endpoint. Public (PKCE-only) clients have no credentials to
 * authenticate with and are rejected — accepting anonymous callers
 * would open the endpoint to token scanning.
 *
 * The optional `token_type_hint` parameter (§2.1) is accepted but
 * deliberately unused: the token kind is determined from the token
 * itself (the audience named in its header), so the hint can never
 * change the outcome.
 */
export async function handleOidcIntrospectRequest(request: NextRequest): Promise<NextResponse> {
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

  const client_assertion_type: string | null = param("client_assertion_type");
  const client_assertion: string | null = param("client_assertion");
  const uses_client_assertion: boolean =
    client_assertion_type !== null || client_assertion !== null;

  if (uses_client_assertion) {
    // RFC 6749 §2.3: clients MUST NOT use more than one authentication
    // method in each request.
    if (basic_credentials || param("client_secret")) {
      return oidcTokenErrorResponse(
        "invalid_request",
        "Multiple client authentication methods used; send either a client secret or a client assertion, not both.",
      );
    }
    if (client_assertion_type !== OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE) {
      return oidcTokenErrorResponse(
        "invalid_request",
        `Unsupported 'client_assertion_type'; expected '${OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE}'.`,
      );
    }
    if (client_assertion === null) {
      return oidcTokenErrorResponse(
        "invalid_request",
        "Missing 'client_assertion' parameter.",
      );
    }
  }

  // client_secret_basic clients may identify themselves solely through
  // the Authorization header (RFC 6749 §2.3.1); fall back to it when
  // the form omits client_id. A request identifying no client at all is
  // an authentication failure (§2.3 → RFC 6749 §5.2 401), since this
  // endpoint accepts no anonymous callers.
  const raw_client_id: string | null =
    param("client_id") ?? basic_credentials?.client_id ?? null;

  let client_app_id: AppId | null = null;
  if (!uses_client_assertion) {
    if (raw_client_id === null) {
      return invalidClientResponse(
        "Client authentication is required to introspect tokens (client_secret_basic, client_secret_post or private_key_jwt).",
      );
    }
    const parsed_client_id = appIdSchema.safeParse(raw_client_id);
    if (!parsed_client_id.success) {
      return oidcTokenErrorResponse(
        "invalid_request",
        "Malformed 'client_id' parameter.",
      );
    }
    client_app_id = parsed_client_id.data;
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    let caller: OidcIntrospectionCaller;
    if (uses_client_assertion) {
      const outcome = await authenticateApiServer(
        dbh,
        client_assertion!,
        raw_client_id,
      );
      if (!outcome.ok) {
        return outcome.response;
      }
      caller = outcome.caller;
    } else {
      const app_id: AppId = client_app_id!;
      const clientAuth = await authenticateTokenEndpointClient({
        db: dbh.db,
        client_app_id: app_id,
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
        return invalidClientResponse(
          "Token introspection requires a confidential client; register a client secret for this app.",
        );
      }
      caller = { kind: "client_app", client_app_id: app_id };
    }

    const body: OidcIntrospectionResponseBody = await introspectOidcToken({
      dbh,
      token,
      caller,
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
      context: {
        client_id: raw_client_id,
        client_authentication: uses_client_assertion
          ? "private_key_jwt"
          : "client_secret",
      },
    });
    return oidcTokenErrorResponse(
      "server_error",
      "Failed to process the introspection request.",
      500,
    );
  }
}
