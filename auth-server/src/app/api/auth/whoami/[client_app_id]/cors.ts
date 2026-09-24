import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { type AppId, appIdSchema, getAppEnvironment } from "@schemavaults/app-definitions";
import type { Hono } from "@schemavaults/openapi-operations";
import { ServerlessDatabase } from "@/lib/auth-db";
import {
  buildCorsHeaders,
  handleCorsPreflightForClientApp,
  validateCorsForClientApp,
} from "@/lib/cors/cors-for-client-app";
import shouldEnableDebug from "@/lib/should-enable-debug";

export const WHOAMI_CORS_METHODS = "GET, OPTIONS";

/** Hono path of the operation (what the middleware is registered on). */
const WHOAMI_HONO_PATH = "/api/auth/whoami/:client_app_id";

function asNextRequest(request: Request): NextRequest {
  return request instanceof NextRequest ? request : toNextRequest(request);
}

/**
 * CORS preflight (OPTIONS) of GET /api/auth/whoami/{client_app_id}: 400 for
 * a malformed id, otherwise the shared per-client-app preflight (204 with
 * credentialed CORS headers for a registered origin, 403 for others).
 */
export async function whoamiPreflight(
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
  return handleCorsPreflightForClientApp(parsed.data, asNextRequest(request), dbh, WHOAMI_CORS_METHODS);
}

/**
 * Per-client-app CORS around the whoami operation. Runs AFTER the
 * operation (auth, params, handler) produced its response so that:
 *
 * - unauthenticated callers always see the 401 first, whatever
 *   `client_app_id` or `Origin` they sent (no probing of which apps /
 *   origins are registered);
 * - an authenticated 200 from an origin that is not registered for the
 *   app is replaced by a 403: a session must not read another app's user
 *   data from a foreign origin;
 * - the CORS headers are applied to whatever the operation answered (401
 *   and 403 included) when the origin is registered, so browser SDK
 *   probes from client apps get a parseable response instead of a CORS
 *   error. For an unregistered origin nothing is added.
 *
 * A malformed id never reaches the CORS logic: the runtime already
 * answered 400 (or 401 for an unauthenticated caller).
 */
export function configureWhoamiCors(app: Hono): void {
  app.use(WHOAMI_HONO_PATH, async (c, next) => {
    await next();

    const parsed = appIdSchema.safeParse(c.req.param("client_app_id"));
    if (!parsed.success) return;
    const client_app_id: AppId = parsed.data;
    const debug: boolean = shouldEnableDebug(getAppEnvironment());

    await using dbh = ServerlessDatabase.createDBH();
    const corsResult = await validateCorsForClientApp(
      { client_app_id, request: asNextRequest(c.req.raw) },
      dbh,
      debug,
    );

    if (c.res.status === 200 && !corsResult.allowed) {
      if (debug) {
        console.warn("Request blocked with CORS error: ", corsResult);
      }
      c.res = NextResponse.json(
        { success: false, error: true, message: corsResult.error },
        { status: 403 },
      );
      return;
    }

    if (!corsResult.allowed || corsResult.skipCorsHeaders) return;

    const response = c.res;
    const headers = new Headers(response.headers);
    new Headers(buildCorsHeaders(corsResult.origin, WHOAMI_CORS_METHODS)).forEach((value, key) => {
      headers.set(key, value);
    });
    c.res = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
