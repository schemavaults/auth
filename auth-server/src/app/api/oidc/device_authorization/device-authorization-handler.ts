import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsApp,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  formatUserCode,
  getDeviceVerificationUri,
  getDeviceVerificationUriComplete,
  type DeviceAuthorizationResponse,
} from "@schemavaults/auth-common";
import { ServerlessDatabase } from "@/lib/auth-db";
import { getApp } from "@/lib/auth-db/apps";
import { createDeviceAuthorization } from "@/lib/auth-db/device-authorizations";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import captureServerException from "@/lib/captureServerException";
import {
  authenticateTokenEndpointClient,
  TOKEN_ENDPOINT_WWW_AUTHENTICATE,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import {
  checkDeviceFlowClient,
  parseDeviceAuthorizationRequest,
} from "@/lib/oidc/device-authorization";
import { oidcTokenErrorResponse, type OidcTokenErrorCode } from "@/lib/oidc/oidc-errors";
import { RedisCache } from "@/lib/redis";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  DEVICE_AUTHORIZATION_RATE_LIMIT,
} from "@/lib/rate-limit";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { DEVICE_AUTHORIZATION_CORS_HEADERS } from "./cors";

const ROUTE = "/api/oidc/device_authorization";

/** RFC 6749 §5.2 errors, with the challenge `invalid_client` 401s carry. */
function errorResponse(
  error: OidcTokenErrorCode,
  error_description: string,
): NextResponse {
  return error === "invalid_client"
    ? oidcTokenErrorResponse(error, error_description, 401, {
        "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE,
      })
    : oidcTokenErrorResponse(error, error_description, 400);
}

/**
 * The device authorization endpoint (RFC 8628 §3.1-3.2), advertised as
 * `device_authorization_endpoint`. A device that cannot show the login page
 * (a CLI, a TV app) asks it for a device code and a user code; it shows the
 * user the code and the `/device` page to enter it on, then polls the token
 * endpoint with the device code (grant_type=device_code) until the user
 * approves or denies the request there.
 *
 * Clients authenticate as at the token endpoint (public clients with
 * `client_id` alone, confidential ones with their secret), may only use the
 * grant once their managers enabled it (`checkDeviceFlowClient()`), and are
 * rate limited per IP. The requested `scope` and `resource` are stored as
 * asked; what is granted is decided when the user approves.
 */
export async function handleOidcDeviceAuthorizationRequest(
  request: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  const parsed = await parseDeviceAuthorizationRequest(request, environment);
  if (!parsed.ok) {
    return errorResponse(parsed.error.error, parsed.error.error_description);
  }
  const { client_app_id, basic_credentials, post_client_secret, scope, resource } =
    parsed.request;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    const clientAuth = await authenticateTokenEndpointClient({
      db: dbh.db,
      client_app_id,
      basic_credentials,
      post_client_secret,
    });
    if (!clientAuth.ok) {
      return errorResponse(clientAuth.error, clientAuth.error_description);
    }

    const client_app: SchemaVaultsApp | null = await getApp(dbh.db, client_app_id, debug);
    const client_check = await checkDeviceFlowClient(dbh.db, client_app);
    if (!client_check.ok) {
      return errorResponse(client_check.error, client_check.error_description);
    }

    const ip: string | null = extractClientIp(request);
    if (!ip) {
      return ipRequiredResponse();
    }
    {
      await using redis = RedisCache.createConnection();
      const rate = await checkRateLimit(redis.client, DEVICE_AUTHORIZATION_RATE_LIMIT, { ip });
      if (!rate.allowed) {
        return rateLimitResponse(rate);
      }
    }

    const created = await createDeviceAuthorization(dbh.db, {
      client_app_id,
      requested_scope: scope,
      resource,
    });
    const issuer: string = getAuthServerUri(environment);
    const body: DeviceAuthorizationResponse = {
      device_code: created.device_code,
      user_code: formatUserCode(created.user_code),
      verification_uri: getDeviceVerificationUri(issuer),
      verification_uri_complete: getDeviceVerificationUriComplete(issuer, created.user_code),
      expires_in: Math.round((created.expires_at - Date.now()) / 1000),
      interval: created.interval_seconds,
    };
    if (debug) {
      console.log(
        `[${ROUTE}] Started device authorization ${created.device_authorization_id} for client '${client_app_id}'`,
      );
    }
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...DEVICE_AUTHORIZATION_CORS_HEADERS,
      },
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcDeviceAuthorization.POST",
      route: ROUTE,
      context: { client_app_id },
    });
    return oidcTokenErrorResponse(
      "server_error",
      "Failed to process the device authorization request.",
      500,
    );
  }
}

export default handleOidcDeviceAuthorizationRequest;
