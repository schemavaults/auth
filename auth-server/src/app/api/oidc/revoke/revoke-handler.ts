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
  authenticateRevocationClient,
  decodeRevocableToken,
  parseRevocationRequest,
  revokeDecodedToken,
  type RevocableToken,
  type RevocationRequestError,
} from "@/lib/oidc/revocation";
import { REVOCATION_CORS_HEADERS } from "./cors";

const ROUTE = "/api/oidc/revoke";

/**
 * RFC 6749 §5.2: `invalid_client` is a 401 with a `WWW-Authenticate`
 * challenge (Basic is advertised on every 401, as at the token endpoint);
 * `invalid_request` a 400.
 */
function revocationErrorResponse({
  error,
  error_description,
}: RevocationRequestError): NextResponse {
  return error === "invalid_client"
    ? oidcTokenErrorResponse(error, error_description, 401, {
        "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE,
      })
    : oidcTokenErrorResponse(error, error_description, 400);
}

/** RFC 7009 §2.2: a revoked or invalid token is a 200 whose body is ignored. */
function revocationOkResponse(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...REVOCATION_CORS_HEADERS,
    },
  });
}

/**
 * The OAuth 2.0 token revocation endpoint (RFC 7009), advertised as
 * `revocation_endpoint` in the discovery document. A client revokes a
 * refresh token issued to it (with the access tokens minted alongside it),
 * one of its `oidc-userinfo` access tokens, or a delegated access token it
 * obtained by token exchange. The steps live in
 * `@/lib/oidc/revocation`: parse the request, authenticate the client,
 * verify the token and that it was issued to the client, revoke it.
 */
export async function handleOidcRevokeRequest(
  request: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  const parsed = await parseRevocationRequest(request);
  if (!parsed.ok) {
    return revocationErrorResponse(parsed.error);
  }
  const { token, client_app_id, basic_credentials, post_client_secret } =
    parsed.request;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    const authentication = await authenticateRevocationClient({
      db: dbh.db,
      client_app_id,
      basic_credentials,
      post_client_secret,
    });
    if (!authentication.ok) {
      return revocationErrorResponse(authentication.error);
    }

    const revocable: RevocableToken = await decodeRevocableToken({
      db: dbh.db,
      token,
      client_app_id,
      environment,
    });
    switch (revocable.kind) {
      case "unverifiable":
        // §2.2: an invalid token is already unusable; nothing to do.
        return revocationOkResponse();
      case "unsupported":
        return oidcTokenErrorResponse(
          "unsupported_token_type",
          "Access tokens minted for an API server cannot be revoked here; revoke the refresh token they were issued with.",
          400,
        );
      case "issued_to_another_client":
        return oidcTokenErrorResponse(
          "invalid_grant",
          "The token was not issued to this client.",
          400,
        );
      default:
        await revokeDecodedToken(dbh.db, revocable);
        return revocationOkResponse();
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcRevoke.POST",
      route: ROUTE,
      context: {
        client_id: client_app_id,
        client_authentication:
          basic_credentials !== null
            ? "client_secret_basic"
            : post_client_secret !== null
              ? "client_secret_post"
              : "none",
      },
    });
    return oidcTokenErrorResponse(
      "server_error",
      "Failed to process the revocation request.",
      500,
    );
  }
}
