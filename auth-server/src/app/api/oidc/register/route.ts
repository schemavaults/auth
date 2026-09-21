import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse, type NextRequest } from "next/server";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  parseDynamicClientRegistrationRequest,
  type DynamicClientRegistrationError,
  type DynamicClientRegistrationResponse,
} from "@schemavaults/auth-common";
import { ServerlessDatabase } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  buildDynamicClientRegistrationResponse,
  loadDynamicClientRegistrationSettings,
  registerDynamicClient,
} from "@/lib/oidc/dynamic-client-registration";
import {
  checkRateLimit,
  DYNAMIC_CLIENT_REGISTRATION_RATE_LIMIT,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { RedisCache } from "@/lib/redis";

const ROUTE = "/api/oidc/register";

/**
 * Largest request body accepted. RFC 7591 metadata for a client is a
 * few hundred bytes; the cap only bounds abuse of an unauthenticated
 * endpoint (50 redirect URIs of 2048 characters fit comfortably).
 */
const MAX_REQUEST_BODY_BYTES = 128 * 1024;

// Registration is an anonymous, credential-free POST: any origin may
// call it (browser-based MCP clients included), so a wildcard CORS
// allowance is safe.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

// RFC 7591 §3.2.1 / §3.2.2: responses carry a client secret or an error
// and must never be cached.
const NO_STORE_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

type RegistrationRefusal = DynamicClientRegistrationError | {
  error: "access_denied" | "invalid_request" | "server_error";
  error_description: string;
};

function errorResponse(body: RegistrationRefusal, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * OAuth 2.0 Dynamic Client Registration endpoint (RFC 7591 §3).
 *
 * Unauthenticated (no initial access token; open registration), off by
 * default: the `allow_dynamic_client_registration` server setting must
 * be on (the discovery document advertises `registration_endpoint` only
 * then). Registrations are rate limited per IP in their own bucket.
 *
 * A valid request creates an ownerless client application
 * (`owner_type = 'dynamic-client-registration'`, manageable by global
 * admins only) with its redirect URIs registered as explicit callback
 * URLs for the deployment's own environment and, for confidential
 * clients, a generated client secret — all in one transaction. The
 * response is the §3.2.1 document: `client_id`, the one-time
 * `client_secret` (when applicable), `client_id_issued_at`, and every
 * registered metadata value. Unsupported metadata values are refused
 * with `invalid_client_metadata`, bad redirect URIs with
 * `invalid_redirect_uri` (§3.2.2).
 *
 * RFC 7592 client configuration management (registration access
 * tokens, PUT/DELETE) is not implemented; registered clients are
 * managed from the admin console.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
  await using redis = RedisCache.createConnection();

  try {
    const settings = await loadDynamicClientRegistrationSettings(
      dbh.db,
      redis.client,
    );
    if (!settings.enabled) {
      return errorResponse(
        {
          error: "access_denied",
          error_description:
            "Dynamic client registration is disabled on this authorization server.",
        },
        403,
      );
    }

    const ip: string | null = extractClientIp(request);
    if (!ip) {
      return ipRequiredResponse();
    }
    const rateLimitResult = await checkRateLimit(
      redis.client,
      DYNAMIC_CLIENT_REGISTRATION_RATE_LIMIT,
      { ip },
    );
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const content_length: number = Number(
      request.headers.get("Content-Length") ?? "0",
    );
    if (Number.isFinite(content_length) && content_length > MAX_REQUEST_BODY_BYTES) {
      return errorResponse(
        {
          error: "invalid_client_metadata",
          error_description: "Request body is too large.",
        },
        413,
      );
    }

    let body: unknown;
    try {
      const text: string = await request.text();
      if (text.length > MAX_REQUEST_BODY_BYTES) {
        return errorResponse(
          {
            error: "invalid_client_metadata",
            error_description: "Request body is too large.",
          },
          413,
        );
      }
      body = JSON.parse(text);
    } catch {
      return errorResponse(
        {
          error: "invalid_client_metadata",
          error_description: "Request body must be a JSON object.",
        },
        400,
      );
    }

    const parsed = parseDynamicClientRegistrationRequest(body, settings);
    if (!parsed.ok) {
      if (debug) {
        console.warn(`[${ROUTE}] Refusing registration:`, parsed.error);
      }
      return errorResponse(parsed.error, 400);
    }

    const registered = await registerDynamicClient({
      db: dbh.db,
      metadata: parsed.metadata,
      environment,
    });
    const response_body: DynamicClientRegistrationResponse =
      buildDynamicClientRegistrationResponse(registered);

    if (debug) {
      console.log(
        `[${ROUTE}] Registered dynamic client '${registered.client_id}' (${parsed.metadata.token_endpoint_auth_method}) from ${ip}`,
      );
    }

    return NextResponse.json(response_body, {
      status: 201,
      headers: NO_STORE_HEADERS,
    });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcRegister.POST",
      route: ROUTE,
    });
    return errorResponse(
      {
        error: "server_error",
        error_description: "Failed to process the registration request.",
      },
      500,
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
