import "server-only";
import { NextResponse } from "next/server";
import {
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { CLIENT_ERROR_REPORT_LIMITS } from "@schemavaults/auth-common";
import type { Hono } from "@schemavaults/openapi-operations";
import { toNextRequest } from "@/lib/api/next-request";
import { ServerlessDatabase } from "@/lib/auth-db";
import { getApp } from "@/lib/auth-db/apps";
import {
  buildCorsHeaders,
  getAppAllowedOriginsForEnvironment,
  handleCorsPreflightForClientApp,
  isOriginAllowedForClientApp,
} from "@/lib/cors/cors-for-client-app";
import {
  getStoredClientErrorBytes,
  loadClientErrorIntakeSettings,
} from "@/lib/client-errors/intake-policy";
import {
  CLIENT_ERROR_REPORT_APP_RATE_LIMIT,
  CLIENT_ERROR_REPORT_RATE_LIMIT,
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { RedisCache } from "@/lib/redis";

export const CLIENT_ERRORS_CORS_METHODS = "POST, OPTIONS";

/** Hono path of the operation (what the gate is registered on). */
const CLIENT_ERRORS_HONO_PATH = "/api/client-errors/:client_app_id";

/** Machine-readable `error` codes of the refusals the SDK acts on. */
export const CLIENT_ERROR_INTAKE_ERRORS = {
  disabled: "client_error_reporting_disabled",
  storageFull: "client_error_storage_full",
} as const;

/** How long a client should wait after a "storage full" refusal. */
const STORAGE_FULL_RETRY_AFTER_SECONDS: number = 60 * 60;

/**
 * Response headers a cross-origin script may read: without this, `fetch`
 * hides `Retry-After` from the SDK, which then cannot honor it.
 */
const EXPOSED_HEADERS = "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset";

function refuse(status: 403 | 404 | 413 | 503, message: string, error: string | true = true): Response {
  return NextResponse.json({ success: false, error, message }, { status });
}

function withHeaders(response: Response, extra: HeadersInit): Response {
  const headers = new Headers(response.headers);
  new Headers(extra).forEach((value, key) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** `response` with the per-client-app CORS headers for `origin`. */
function withCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(buildCorsHeaders(origin, CLIENT_ERRORS_CORS_METHODS));
  headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  return withHeaders(response, headers);
}

/**
 * CORS headers for a refusal made before the origin check (intake off, IP
 * rate limited): readable by any page, so the SDK sees why it was refused
 * and stops or backs off. Reports are sent without credentials, so the
 * wildcard reveals nothing a page could not already learn.
 */
function withPublicCorsHeaders(response: Response): Response {
  return withHeaders(response, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
  });
}

type OriginCheck =
  | { allowed: true; corsOrigin: string | null }
  | { allowed: false; response: Response };

/**
 * The per-client-app CORS policy every other client-app endpoint applies
 * (see `validateCorsForClientApp`): a browser report must come from an
 * origin registered for the app in this environment; callers without an
 * `Origin` (native apps, servers) are accepted unless the app is a web app.
 */
async function checkReportOrigin(
  client_app_id: AppId,
  request: Request,
  dbh: ServerlessDatabase,
): Promise<OriginCheck> {
  const app: SchemaVaultsApp | null = await getApp(dbh.db, client_app_id);
  if (!app) {
    return { allowed: false, response: refuse(404, "App not found") };
  }

  const origin: string | null = request.headers.get("Origin");
  if (!origin) {
    return app.web
      ? { allowed: false, response: refuse(403, "Web apps must include an Origin header") }
      : { allowed: true, corsOrigin: null };
  }

  const allowedOrigins: readonly string[] = await getAppAllowedOriginsForEnvironment(
    client_app_id,
    getAppEnvironment(),
    dbh,
  );
  if (!isOriginAllowedForClientApp(origin, allowedOrigins)) {
    return {
      allowed: false,
      response: refuse(403, `Origin '${origin}' is not allowed for app '${client_app_id}'`),
    };
  }
  return { allowed: true, corsOrigin: origin };
}

/**
 * CORS preflight (OPTIONS) of POST /api/client-errors/{client_app_id}: 400
 * for a malformed id, otherwise the shared per-client-app preflight (204
 * with CORS headers for a registered origin, 403 for others). The client
 * SDK sends its reports as `text/plain` (a CORS "simple" request), so
 * browsers only preflight callers that label their body `application/json`.
 */
export async function clientErrorsPreflight(
  request: Request,
  params: Readonly<Record<string, string>>,
): Promise<Response> {
  const parsed = appIdSchema.safeParse(params.client_app_id);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 },
    );
  }
  await using dbh = ServerlessDatabase.createDBH();
  return handleCorsPreflightForClientApp(
    parsed.data,
    toNextRequest(request),
    dbh,
    CLIENT_ERRORS_CORS_METHODS,
  );
}

/**
 * Gate in front of the report intake. Simple requests are not preflighted,
 * so the browser does not keep a foreign page from POSTing here: every
 * check has to happen on the server, before anything is stored. Cheap
 * checks come first so a flood cannot drive database load:
 *
 * 1. a body declared larger than {@link CLIENT_ERROR_REPORT_LIMITS.max_body_bytes} is refused with 413;
 * 2. while the `accept_client_error_reports` setting is off, 403
 *    (`client_error_reporting_disabled`);
 * 3. reports are rate limited per IP (429);
 * 4. an unknown app is refused with 404, an origin not registered for the
 *    app (or a web app's report without an `Origin`) with 403;
 * 5. reports are limited per app per hour (429);
 * 6. once the stored reports reach `client_error_reports_max_storage_mb`,
 *    503 (`client_error_storage_full`, `Retry-After`).
 *
 * Refusals 2–3 are readable by any origin, the rest (and the operation's
 * own responses) by the app's registered origins, so the SDK can read
 * `Retry-After` and back off. A malformed id is left to the runtime's 400.
 */
export function configureClientErrorsGate(app: Hono): void {
  app.use(CLIENT_ERRORS_HONO_PATH, async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return;
    }

    const parsed = appIdSchema.safeParse(c.req.param("client_app_id"));
    if (!parsed.success) {
      await next();
      return;
    }
    const client_app_id: AppId = parsed.data;

    const content_length: number = Number(c.req.header("Content-Length") ?? "0");
    if (Number.isFinite(content_length) && content_length > CLIENT_ERROR_REPORT_LIMITS.max_body_bytes) {
      c.res = refuse(413, `Client error reports are limited to ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes} bytes`);
      return;
    }

    let corsOrigin: string | null;
    {
      await using dbh = ServerlessDatabase.createDBH();
      await using redis = RedisCache.createConnection();

      const settings = await loadClientErrorIntakeSettings(dbh.db, redis.client);
      if (!settings.accepting_reports) {
        c.res = withPublicCorsHeaders(
          refuse(403, "Client error reporting is disabled on this server", CLIENT_ERROR_INTAKE_ERRORS.disabled),
        );
        return;
      }

      const ip: string | null = extractClientIp(c.req.raw);
      if (!ip) {
        c.res = withPublicCorsHeaders(ipRequiredResponse());
        return;
      }
      const ipLimit = await checkRateLimit(redis.client, CLIENT_ERROR_REPORT_RATE_LIMIT, { ip });
      if (!ipLimit.allowed) {
        c.res = withPublicCorsHeaders(rateLimitResponse(ipLimit));
        return;
      }

      const check: OriginCheck = await checkReportOrigin(client_app_id, c.req.raw, dbh);
      if (!check.allowed) {
        c.res = check.response;
        return;
      }
      corsOrigin = check.corsOrigin;
      const decorate = (response: Response): Response =>
        corsOrigin ? withCorsHeaders(response, corsOrigin) : response;

      const appLimit = await checkRateLimit(redis.client, CLIENT_ERROR_REPORT_APP_RATE_LIMIT, { client_app_id });
      if (!appLimit.allowed) {
        c.res = decorate(rateLimitResponse(appLimit));
        return;
      }

      const stored_bytes: number = await getStoredClientErrorBytes(dbh.db, redis.client);
      if (stored_bytes >= settings.max_storage_bytes) {
        c.res = decorate(
          withHeaders(
            refuse(
              503,
              "Client error report storage is full; reports are refused until older reports are deleted or the limit is raised",
              CLIENT_ERROR_INTAKE_ERRORS.storageFull,
            ),
            { "Retry-After": String(STORAGE_FULL_RETRY_AFTER_SECONDS) },
          ),
        );
        return;
      }
    }

    await next();
    c.res = corsOrigin ? withCorsHeaders(c.res, corsOrigin) : c.res;
  });
}
