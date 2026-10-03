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

function refuse(status: 403 | 404 | 413, message: string): Response {
  return NextResponse.json({ success: false, error: true, message }, { status });
}

/** `response` with the per-client-app CORS headers for `origin`. */
function withCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  new Headers(buildCorsHeaders(origin, CLIENT_ERRORS_CORS_METHODS)).forEach((value, key) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
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
 * so the browser does not keep a foreign page from POSTing here: the
 * origin check has to happen on the server, before anything is stored.
 *
 * 1. a body declared larger than {@link CLIENT_ERROR_REPORT_LIMITS.max_body_bytes} is refused with 413;
 * 2. an unknown app is refused with 404, an origin not registered for the
 *    app (or a web app's report without an `Origin`) with 403;
 * 3. reports are rate limited per IP (429, with CORS headers so the SDK
 *    can read `Retry-After` and back off);
 * 4. every response to an allowed origin carries the CORS headers.
 *
 * A malformed id is left to the runtime's 400.
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

    const content_length: number = Number(c.req.header("Content-Length") ?? "0");
    if (Number.isFinite(content_length) && content_length > CLIENT_ERROR_REPORT_LIMITS.max_body_bytes) {
      c.res = refuse(413, `Client error reports are limited to ${CLIENT_ERROR_REPORT_LIMITS.max_body_bytes} bytes`);
      return;
    }

    let check: OriginCheck;
    {
      await using dbh = ServerlessDatabase.createDBH();
      check = await checkReportOrigin(parsed.data, c.req.raw, dbh);
    }
    if (!check.allowed) {
      c.res = check.response;
      return;
    }
    const corsOrigin: string | null = check.corsOrigin;
    const decorate = (response: Response): Response =>
      corsOrigin ? withCorsHeaders(response, corsOrigin) : response;

    const ip: string | null = extractClientIp(c.req.raw);
    if (!ip) {
      c.res = decorate(ipRequiredResponse());
      return;
    }
    {
      await using redis = RedisCache.createConnection();
      const rateLimit = await checkRateLimit(redis.client, CLIENT_ERROR_REPORT_RATE_LIMIT, { ip });
      if (!rateLimit.allowed) {
        c.res = decorate(rateLimitResponse(rateLimit));
        return;
      }
    }

    await next();
    c.res = decorate(c.res);
  });
}
