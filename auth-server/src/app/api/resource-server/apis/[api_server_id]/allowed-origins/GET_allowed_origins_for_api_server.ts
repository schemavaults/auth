import "server-only";
import { connection, type NextRequest, NextResponse } from "next/server";
import { ServerlessDatabase } from "@/lib/auth-db";
import {
  apiServerIdSchema,
  getAppEnvironment,
  SCHEMAVAULTS_AUTH_APP_ID,
  type ApiServerId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import verifyJwksAccessAssertion from "@/app/api/jwks/[audience]/verifyJwksAccessAssertion";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db/apis/app-to-api-permissions-registry";
import { getAppAllowedOriginsForEnvironment } from "@/lib/cors/cors-for-client-app";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/resource-server/apis/[api_server_id]/allowed-origins";

/**
 * List the origins allowed to make cross-origin requests to a resource
 * server: the union of the environment-scoped domains of every client app
 * connected to the given API server.
 *
 * Authenticated with a JWKS access proof token signed by the resource
 * server's private key — the assertion audience must match the
 * `api_server_id` path param, so a resource server can only query its own
 * allowed origins.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ api_server_id: string }> },
): Promise<NextResponse> {
  await connection();
  const { api_server_id: raw_api_server_id } = await props.params;

  const parsed_api_server_id = apiServerIdSchema.safeParse(raw_api_server_id);
  if (!parsed_api_server_id.success) {
    return NextResponse.json(
      { success: false, error: "Invalid API server ID" },
      { status: 400 },
    );
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;

  if (api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
    return NextResponse.json(
      {
        success: false,
        error: "The auth server does not export allowed origins via this endpoint",
      },
      { status: 400 },
    );
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const [type, assertion] = authorization.split(" ");
  if (type !== "Bearer" || !assertion) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  await using dbh = ServerlessDatabase.createDBH();

  const isAuthenticated: boolean = await verifyJwksAccessAssertion(
    assertion,
    api_server_id,
    dbh.db,
  );
  if (!isAuthenticated) {
    console.warn(
      `[resource-server/apis/allowed-origins] Unauthorized request for api_server_id="${api_server_id}"`,
    );
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  try {
    const registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
    const connectedApps = await registry.listConnectedApps(api_server_id);

    const origins = new Set<string>();
    for (const { client_app_id } of connectedApps) {
      const appOrigins = await getAppAllowedOriginsForEnvironment(
        client_app_id,
        environment,
        dbh,
      );
      for (const origin of appOrigins) {
        origins.add(origin);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          api_server_id,
          environment,
          origins: [...origins].sort(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "resource-server-allowed-origins.listOrigins",
      route: ROUTE,
      context: { api_server_id, environment },
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
