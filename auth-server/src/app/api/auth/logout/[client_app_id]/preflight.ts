import "server-only";
import { NextResponse } from "next/server";
import {
  type AppId,
  appIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { ServerlessDatabase, SchemaVaultsAppRegistry } from "@/lib/auth-db";
import {
  getAppAllowedOriginsForEnvironment,
  isOriginAllowedForClientApp,
  buildCorsHeaders,
} from "@/lib/cors/cors-for-client-app";

/**
 * CORS preflight (OPTIONS) of POST /api/auth/logout/{client_app_id}:
 * 204 without CORS headers for non-browser callers (no Origin), 204 with
 * credentialed CORS headers for an origin registered for the app, 403 for
 * any other origin, 404 for an unknown app and 400 for a malformed id.
 */
export async function logoutPreflight(
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

  const client_app_id: AppId = parsed.data;
  const origin: string | null = request.headers.get("Origin");

  // No origin header = not a browser CORS request, allow it
  if (!origin) {
    return new NextResponse(null, { status: 204 });
  }

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  await using dbh = ServerlessDatabase.createDBH();

  // Check if app exists
  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const app = await appRegistry.getApp(client_app_id);
  if (!app) {
    return NextResponse.json(
      { success: false, error: true, message: "App not found" },
      { status: 404 },
    );
  }

  // Validate origin against allowed domains
  const allowedOrigins: readonly string[] = await getAppAllowedOriginsForEnvironment(
    client_app_id,
    environment,
    dbh,
  );

  if (!isOriginAllowedForClientApp(origin, allowedOrigins)) {
    return NextResponse.json(
      {
        success: false,
        error: true,
        message: `Origin '${origin}' is not allowed for app '${client_app_id}'`,
      },
      { status: 403 },
    );
  }

  // Return 204 with CORS headers
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export default logoutPreflight;
