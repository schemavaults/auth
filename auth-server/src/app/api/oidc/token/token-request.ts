import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  appIdSchema,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsApp,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { OidcRefreshTokenDeliveryMode } from "@schemavaults/auth-common";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ServerlessDatabase } from "@/lib/auth-db";
import { getApp } from "@/lib/auth-db/apps";
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
import {
  isGrantTypeAllowedForClientApp,
  parseTokenEndpointGrantType,
  type TokenEndpointGrantType,
} from "@/lib/oauth2/client-grant-types";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import deliverOidcTokens from "@/lib/oidc/deliver-oidc-tokens";
import {
  TOKEN_EXCHANGE_GRANT_TYPE,
  findMisplacedTokenExchangeParam,
  type TokenExchangeOnlyParam,
} from "@/lib/oidc/token-exchange";
import { parseOidcRefreshTokenDeliveryParam } from "@/lib/oidc/token-request-extensions";
import { RedisCache } from "@/lib/redis";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  CLIENT_CREDENTIALS_RATE_LIMIT,
  REFRESH_TOKEN_RATE_LIMIT,
  TOKEN_EXCHANGE_RATE_LIMIT,
  type RateLimitConfig,
} from "@/lib/rate-limit";
import handleOidcAuthorizationCodeGrant from "./authorization_code_grant";
import handleOidcClientCredentialsGrant from "./client_credentials_grant";
import handleOidcRefreshTokenGrant, {
  isRefreshTokenPresentedViaCookie,
} from "./refresh_token_grant";
import handleOidcTokenExchangeGrant from "./token_exchange_grant";
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
 * The `default` of every `switch` on the grant type. Typed `never`, so a
 * grant added to TOKEN_ENDPOINT_GRANT_TYPES without its own case does not
 * compile; should one get through anyway, the request fails loudly (the
 * handler records it and answers 500) instead of falling through.
 */
function unhandledGrantType(grant_type: never): never {
  throw new TypeError(
    `Unhandled token endpoint grant_type: '${String(grant_type)}'`,
  );
}

/**
 * The per-IP budget of a grant, or null for none. The grants that can be
 * replayed without user interaction are budgeted, so a stolen refresh
 * token (or leaked client secret) cannot turn into an unbounded minting
 * loop; each has its own bucket so M2M traffic never starves browser
 * refreshes. An authorization code is single-use and needs none.
 */
function getGrantRateLimit(
  grant_type: TokenEndpointGrantType,
): RateLimitConfig | null {
  switch (grant_type) {
    case "authorization_code":
      return null;
    case "refresh_token":
      return REFRESH_TOKEN_RATE_LIMIT;
    case "client_credentials":
      return CLIENT_CREDENTIALS_RATE_LIMIT;
    case TOKEN_EXCHANGE_GRANT_TYPE:
      return TOKEN_EXCHANGE_RATE_LIMIT;
    default:
      return unhandledGrantType(grant_type);
  }
}

/** Runs the grant's own handler (./<grant>_grant.ts). */
async function handleOidcGrant(
  grant_type: TokenEndpointGrantType,
  ctx: OidcGrantContext,
): Promise<OidcGrantOutcome> {
  switch (grant_type) {
    case "authorization_code":
      return await handleOidcAuthorizationCodeGrant(ctx);
    case "refresh_token":
      return await handleOidcRefreshTokenGrant(ctx);
    case "client_credentials":
      return await handleOidcClientCredentialsGrant(ctx);
    case TOKEN_EXCHANGE_GRANT_TYPE:
      return await handleOidcTokenExchangeGrant(ctx);
    default:
      return unhandledGrantType(grant_type);
  }
}

/**
 * The OIDC token endpoint (RFC 6749 §3.2, form-encoded): exchanges an
 * authorization code (grant_type=authorization_code) or a scope-bearing
 * refresh token (grant_type=refresh_token) for the standard token
 * response — with an id_token on the code grant — or, for confidential
 * clients, mints a machine-to-machine access token for the app's
 * service account (grant_type=client_credentials) or a delegated access
 * token on which that service account acts for one of the app's users
 * (RFC 8693 token exchange). Scope/nonce are
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
 * ./refresh_token_grant.ts, ./client_credentials_grant.ts and
 * ./token_exchange_grant.ts. The
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

  const grant_type: TokenEndpointGrantType | null = parseTokenEndpointGrantType(
    param("grant_type"),
  );
  if (grant_type === null) {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code', 'refresh_token', 'client_credentials', or 'urn:ietf:params:oauth:grant-type:token-exchange'.",
      ),
      null,
    );
  }

  // The RFC 8693 parameters belong to the token exchange grant alone; any
  // other grant refuses them rather than silently ignoring them.
  const misplaced_param: TokenExchangeOnlyParam | null =
    findMisplacedTokenExchangeParam(grant_type, param);
  if (misplaced_param !== null) {
    return applyOidcTokenCors(
      oidcTokenErrorResponse(
        "invalid_request",
        `'${misplaced_param}' is only allowed with grant_type=${TOKEN_EXCHANGE_GRANT_TYPE}.`,
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

    // RFC 6749 §5.2 `unauthorized_client`: a client is held to the grant
    // types it registered (RFC 7591 §2), and a dynamically registered
    // client can never use client_credentials. An unknown client_id has
    // no definition to check; each grant refuses it on its own.
    const client_app: SchemaVaultsApp | null = await getApp(
      dbh.db,
      client_app_id,
      debug,
    );
    if (
      client_app !== null &&
      !isGrantTypeAllowedForClientApp(client_app, grant_type)
    ) {
      return withCors(
        oidcTokenErrorResponse(
          "unauthorized_client",
          `This client is not authorized to use the '${grant_type}' grant type.`,
        ),
      );
    }

    const rate_limit: RateLimitConfig | null = getGrantRateLimit(grant_type);
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
      client_app,
      client_authenticated: clientAuth.confidential,
      environment,
      debug,
    };
    const outcome: OidcGrantOutcome = await handleOidcGrant(grant_type, ctx);
    if (!outcome.ok) {
      return withCors(outcome.response);
    }

    return withCors(
      await deliverOidcTokens({
        request,
        issued: outcome.issued,
        client_app_id,
        requested_delivery,
        refresh_token_presented_via_cookie:
          grant_type === "refresh_token" &&
          isRefreshTokenPresentedViaCookie(param, request.cookies, client_app_id),
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
