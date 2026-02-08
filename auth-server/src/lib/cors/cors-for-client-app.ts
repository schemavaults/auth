// cors-for-client-app.ts
// utilities for allowing a client app to access a POST endpoint on the auth-server

import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import {
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsApp,
  type SchemaVaultsAppDomainRef,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { getApp, SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";

/**
 * Extract the Origin header from a request
 */
export function getOriginFromRequest(req: NextRequest): string | null {
  return req.headers.get("Origin");
}

/**
 * Get the allowed origins for a client app in a specific environment
 */
export async function getAppAllowedOriginsForEnvironment(
  client_app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
  dbh: ServerlessDatabase
): Promise<readonly string[]> {
  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const allDomains: SchemaVaultsAppDomainRef[] =
    await appRegistry.getAppDomains(client_app_id);
  const domainsForEnv = allDomains.filter((d) => d.environment === environment);
  return domainsForEnv.map((d) => d.domain);
}

/**
 * Check if an origin is in the list of allowed origins
 */
export function isOriginAllowedForClientApp(
  origin: string,
  allowedOrigins: readonly string[]
): boolean {
  return allowedOrigins.some((allowed) => {
    // Direct match
    if (origin === allowed) return true;
    // Origin may or may not have trailing slash
    if (origin === allowed.replace(/\/$/, "")) return true;
    if (origin.replace(/\/$/, "") === allowed) return true;
    return false;
  });
}

/**
 * Build CORS headers for an allowed origin
 */
export function buildCorsHeaders(origin: string, methods: string = "POST, OPTIONS"): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    Vary: "Origin",
  };
}

export type CorsValidationResult =
  | { allowed: true; origin: string; skipCorsHeaders?: false }
  | { allowed: true; skipCorsHeaders: true; origin?: undefined }
  | { allowed: false; error: string; origin?: string };

export interface CorsValidationOptions {
  client_app_id: AppId;
  request: NextRequest;
}

/**
 * Validate CORS for a client app request
 *
 * Web apps (web: true) MUST have an Origin header - returns error if missing
 * Native apps (web: false) can omit Origin header - if omitted, CORS headers are skipped
 */
export async function validateCorsForClientApp(
  opts: CorsValidationOptions,
  dbh: ServerlessDatabase,
  debug: boolean = false
): Promise<CorsValidationResult> {
  const { client_app_id, request } = opts;
  const origin: string | null = getOriginFromRequest(request);
  const method: string = request.method;
  const environment = getAppEnvironment();

  const app: SchemaVaultsApp | null = await getApp(dbh.db, client_app_id, debug);

  if (!app) {
    return { allowed: false, error: "App not found" };
  }

  // Web apps MUST have an Origin header
  if (app.web && !origin && method !== "GET") {
    return { allowed: false, error: "Web apps must include Origin header" };
  }

  // GET requests are allowed for same-origin (which wouldn't include an Origin header) on web apps
  if (app.web && !origin && method === 'GET') {
    return { allowed: true, skipCorsHeaders: true };
  }

  // Native apps without Origin are allowed (no CORS headers needed)
  if (!app.web && !origin) {
    return { allowed: true, skipCorsHeaders: true };
  }

  // At this point origin is definitely set
  if (!origin) {
    return { allowed: false, error: "Origin header required" };
  }

  // Validate origin against allowed domains
  const allowedOrigins = await getAppAllowedOriginsForEnvironment(
    client_app_id,
    environment,
    dbh
  );

  const allowed = isOriginAllowedForClientApp(origin, allowedOrigins);
  if (!allowed) {
    return {
      allowed: false,
      error: `Origin '${origin}' is not allowed for app '${client_app_id}'`,
      origin,
    };
  }

  return { allowed: true, origin };
}

/**
 * Handle a CORS preflight (OPTIONS) request for a client app
 */
export async function handleCorsPreflightForClientApp(
  client_app_id: AppId,
  req: NextRequest,
  dbh: ServerlessDatabase,
  methods?: string,
): Promise<NextResponse> {
  if (!appIdSchema.safeParse(client_app_id).success) {
    return NextResponse.json(
      { success: false, error: true, message: "Invalid client_app_id" },
      { status: 400 }
    );
  }

  const corsResult = await validateCorsForClientApp(
    { client_app_id, request: req },
    dbh
  );

  if (!corsResult.allowed) {
    return NextResponse.json(
      { success: false, error: true, message: corsResult.error },
      { status: 403 }
    );
  }

  // Native app without origin - return 204 with no CORS headers
  if (corsResult.skipCorsHeaders) {
    return new NextResponse(null, { status: 204 });
  }

  // Return 204 No Content with CORS headers
  const corsHeaders = buildCorsHeaders(corsResult.origin, methods);
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Apply CORS headers to an existing response if appropriate
 */
export async function applyCorsHeadersToResponse(
  response: NextResponse,
  client_app_id: AppId,
  req: NextRequest,
  dbh: ServerlessDatabase,
  methods?: string,
): Promise<NextResponse> {
  const corsResult = await validateCorsForClientApp(
    { client_app_id, request: req },
    dbh
  );

  // If CORS validation failed, return the original response
  // (The caller should have already checked CORS and returned an error if needed)
  if (!corsResult.allowed || corsResult.skipCorsHeaders) {
    return response;
  }

  // Apply CORS headers to the response
  const corsHeaders = buildCorsHeaders(corsResult.origin, methods);
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}
