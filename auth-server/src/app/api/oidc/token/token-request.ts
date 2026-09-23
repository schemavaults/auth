import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { OidcRefreshTokenDeliveryMode } from "@schemavaults/auth-common";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import {
  buildCorsHeaders,
  validateCorsForClientApp,
  type CorsValidationResult,
} from "@/lib/cors/cors-for-client-app";
import {
  authenticateTokenEndpointClient,
  parseBasicClientCredentials,
  TOKEN_ENDPOINT_WWW_AUTHENTICATE,
} from "@/lib/oauth2/authenticate-token-endpoint-client";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import deliverOidcTokens from "@/lib/oidc/deliver-oidc-tokens";
import { parseOidcRefreshTokenDeliveryParam } from "@/lib/oidc/token-request-extensions";
import { RedisCache } from "@/lib/redis";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  CLIENT_CREDENTIALS_RATE_LIMIT,
  REFRESH_TOKEN_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/rate-limit";
import handleOidcAuthorizationCodeGrant from "./authorization_code_grant";
import handleOidcClientCredentialsGrant from "./client_credentials_grant";
import handleOidcRefreshTokenGrant from "./refresh_token_grant";
import {
  applyOidcTokenCors,
  CORS_HEADERS,
  type OidcGrantContext,
  type OidcGrantOutcome,
  type OidcTokenFormParam,
} from "./token-response";

const ROUTE = "/api/oidc/token";

/**
 * CORS preflight. A preflight carries no body, so the client app (and
 * therefore its registered-origin allowlist) is unknown here: the
 * requesting origin is echoed with a credentialed allowance so browser
 * SDK clients can send the platform's refresh-token cookie, and the
 * actual POST enforces the per-client-app origin check before doing any
 * work. (Form-encoded token requests are CORS "simple requests" and
 * usually skip the preflight entirely.)
 */
export async function handleOidcTokenPreflight(request: Request): Promise<NextResponse> {
  const origin: string | null = request.headers.get("Origin");
  return new NextResponse(null, {
    status: 204,
    headers: origin ? buildCorsHeaders(origin) : CORS_HEADERS,
  });
}

/**
 * The OIDC token endpoint (RFC 6749 §3.2, form-encoded): exchanges an
 * authorization code (grant_type=authorization_code) or a scope-bearing
 * refresh token (grant_type=refresh_token) for the standard token
 * response — with an id_token on the code grant — or, for confidential
 * clients, mints a machine-to-machine access token for the app's
 * service account (grant_type=client_credentials). Scope/nonce are
 * first-class on every login flow, so any code is redeemable here
 * regardless of which surface initiated the login (PKCE + client +
 * redirect_uri binding are the security boundary, plus client-secret
 * authentication for confidential clients).
 *
 * The SchemaVaults SDKs use this same endpoint (via `openid-client`)
 * with two extensions on top of the spec behavior: the RFC 8707
 * `resource` parameter to mint access tokens for registered API
 * servers, and `refresh_token_delivery=http_only_cookie` to keep the
 * refresh token out of JavaScript (see
 * `@schemavaults/auth-common` `token-endpoint-extensions.ts`).
 *
 * This module owns the shared request plumbing (form parsing,
 * grant_type dispatch, client_id validation, CORS, client
 * authentication, rate limiting, token delivery, exception capture);
 * the per-grant logic lives in ./authorization_code_grant.ts,
 * ./refresh_token_grant.ts and ./client_credentials_grant.ts. The
 * operation in ./operation.ts mounts it.
 */
export async function handleOidcTokenRequest(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "invalid_request",
        "Request body must be application/x-www-form-urlencoded.",
      ),
      null,
    );
  }
  const param: OidcTokenFormParam = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const grant_type = param("grant_type");
  if (
    grant_type !== "authorization_code" &&
    grant_type !== "refresh_token" &&
    grant_type !== "client_credentials"
  ) {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code', 'refresh_token', or 'client_credentials'.",
      ),
      null,
    );
  }

  const basic_credentials = parseBasicClientCredentials(
    request.headers.get("Authorization"),
  );
  if (basic_credentials === "malformed") {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "invalid_request",
        "Malformed Basic Authorization header.",
      ),
      null,
    );
  }

  // client_secret_basic clients may identify themselves solely through
  // the Authorization header (RFC 6749 §2.3.1); fall back to it when
  // the form omits client_id.
  const parsed_client_id = appIdSchema.safeParse(
    param("client_id") ?? basic_credentials?.client_id ?? null,
  );
  if (!parsed_client_id.success) {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "invalid_request",
        "Missing or malformed 'client_id' parameter.",
      ),
      null,
    );
  }
  const client_app_id: AppId = parsed_client_id.data;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // Browser callers (an `Origin` header is present) must come from one
  // of the client app's registered origins; they then get a
  // credentialed CORS allowance on every response below. Callers
  // without an Origin header (server-side relying parties, CLIs) are
  // served with the wildcard allowance and never touch cookies.
  let cors: CorsValidationResult | null = null;
  if (request.headers.get("Origin") !== null) {
    cors = await validateCorsForClientApp(
      { client_app_id, request },
      dbh,
      debug,
    );
    if (!cors.allowed) {
      return applyOidcTokenCors(
        oidcTokenErrorResponse("invalid_request", cors.error, 403),
        null,
      );
    }
  }
  const withCors = <R extends NextResponse>(response: R): R =>
    applyOidcTokenCors(response, cors);

  try {
    const clientAuth = await authenticateTokenEndpointClient({
      db: dbh.db,
      client_app_id,
      basic_credentials,
      post_client_secret: param("client_secret"),
    });
    if (!clientAuth.ok) {
      return withCors(
        oidcTokenErrorResponse(
          clientAuth.error,
          clientAuth.error_description,
          clientAuth.status,
          clientAuth.status === 401
            ? { "WWW-Authenticate": TOKEN_ENDPOINT_WWW_AUTHENTICATE }
            : {},
        ),
      );
    }

    // Per-IP budgets for the grants that can be replayed without user
    // interaction: a stolen refresh token (or leaked client secret) must
    // not turn into an unbounded minting loop. Each grant has its own
    // bucket so M2M traffic never starves browser refreshes.
    const rate_limit: RateLimitConfig | null =
      grant_type === "refresh_token"
        ? REFRESH_TOKEN_RATE_LIMIT
        : grant_type === "client_credentials"
          ? CLIENT_CREDENTIALS_RATE_LIMIT
          : null;
    if (rate_limit) {
      const ip = extractClientIp(request);
      if (!ip) {
        return withCors(ipRequiredResponse());
      }
      await using redis = RedisCache.createConnection();
      const rateLimitResult = await checkRateLimit(redis.client, rate_limit, {
        ip,
      });
      if (!rateLimitResult.allowed) {
        return withCors(rateLimitResponse(rateLimitResult));
      }
    }

    const parsed_delivery = parseOidcRefreshTokenDeliveryParam(form);
    if (!parsed_delivery.ok) {
      return withCors(
        oidcTokenErrorResponse(
          parsed_delivery.error.error,
          parsed_delivery.error.error_description,
        ),
      );
    }
    const requested_delivery: OidcRefreshTokenDeliveryMode =
      parsed_delivery.mode;

    const ctx: OidcGrantContext = {
      dbh,
      request,
      form,
      param,
      client_app_id,
      client_authenticated: clientAuth.confidential,
      environment,
      debug,
    };
    const outcome: OidcGrantOutcome =
      grant_type === "authorization_code"
        ? await handleOidcAuthorizationCodeGrant(ctx)
        : grant_type === "refresh_token"
          ? await handleOidcRefreshTokenGrant(ctx)
          : await handleOidcClientCredentialsGrant(ctx);
    if (!outcome.ok) {
      return withCors(outcome.response);
    }

    return withCors(
      await deliverOidcTokens({
        request,
        issued: outcome.issued,
        client_app_id,
        requested_delivery,
        environment,
        debug,
      }),
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcToken.POST",
      route: ROUTE,
      context: { client_app_id, grant_type },
    });
    return withCors(
      oidcTokenErrorResponse(
        "invalid_request",
        "Failed to process the token request.",
        500,
      ),
    );
  }
}
