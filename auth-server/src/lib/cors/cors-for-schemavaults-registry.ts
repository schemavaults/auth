// cors-for-schemavaults-registry.ts
// CORS utilities for allowing the schemavaults-registry application to access auth-server API endpoints

import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import {
  getAppEnvironment,
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_REGISTRY_FRONTEND,
} from "@schemavaults/app-definitions";
import { buildCorsHeaders, getOriginFromRequest } from "./cors-for-client-app";

/**
 * Check if the request origin matches the schemavaults-registry domain for the current environment.
 * Returns the origin string if it matches, or null if it doesn't.
 */
function getSchemaVaultsRegistryFrontendOriginIfAllowed(req: NextRequest): string | null {
  const origin = getOriginFromRequest(req);
  if (!origin) return null;

  const environment = getAppEnvironment();
  const expectedOrigin = getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_REGISTRY_FRONTEND.app_id,
    environment,
  );

  if (origin === expectedOrigin) {
    return origin;
  }

  return null;
}

/**
 * Handle a CORS preflight (OPTIONS) request from schemavaults-registry.
 * Returns 204 with CORS headers if origin is allowed, or 204 with no CORS headers otherwise.
 */
export function handleCorsPreflightForSchemaVaultsRegistry(
  req: NextRequest,
  methods: string = "GET, POST, OPTIONS",
): NextResponse {
  const allowedOrigin = getSchemaVaultsRegistryFrontendOriginIfAllowed(req);
  if (!allowedOrigin) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(allowedOrigin, methods),
  });
}

/**
 * Apply CORS headers to an existing response if the request originates from schemavaults-registry.
 */
export function applyCorsHeadersForSchemaVaultsRegistry(
  response: NextResponse,
  req: NextRequest,
  methods: string = "GET, POST, OPTIONS",
): NextResponse {
  const allowedOrigin = getSchemaVaultsRegistryFrontendOriginIfAllowed(req);
  if (!allowedOrigin) {
    return response;
  }

  const corsHeaders = buildCorsHeaders(allowedOrigin, methods);
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}
