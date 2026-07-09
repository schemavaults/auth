import "server-only";
import { ApiServerId, apiServerIdSchema, getAppEnvironment } from "@schemavaults/app-definitions";
import { NextRequest, NextResponse } from "next/server";
import { SchemaVaultsApiServerRegistry, SchemaVaultsAppRegistry, SchemaVaultsAppToApiPermissionsRegistry, ServerlessDatabase } from "@/lib/auth-db";
import { z } from "zod";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import type { ServerRuntime } from "next/types";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { sign_verify_alg } from "@schemavaults/jwt";

const bodySchema = z.object({
  url: z.string().url(),
  jwks_access_public_key: z.string().min(64)
}).required({
  url: true,
  jwks_access_public_key: true
}).strict();

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/test/seed/create-test-nextjs-app/[api_server_id]">
): Promise<NextResponse> {
  const environment = getAppEnvironment();
  if (environment !== 'test') {
    return NextResponse.json({
      message: "Not available in this environment",
      error: true,
      success: false
    }, { status: 404 })
  }

  const parsed_api_server_id = await apiServerIdSchema.safeParseAsync((await ctx.params).api_server_id)
  if (!parsed_api_server_id.success) {
    return NextResponse.json({
      message: "Bad API server ID to initialize JWKS access private key for!",
      error: true,
      success: false
    }, { status: 400 })
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;

  const parsed_body = await bodySchema.safeParseAsync(await req.json())
  if (!parsed_body.success) {
    console.error("Bad request body: ", parsed_body.error);
    return NextResponse.json({
      message: "Bad request body!",
      error: true,
      success: false
    }, { status: 400 })
  }
  const { url, jwks_access_public_key } = parsed_body.data;

  await using dbh = ServerlessDatabase.createDBH();

  const now: number = Date.now();

  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
  const appToApiRegistry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
  const jwksRegistry = new JwksAccessKeysRegistry(dbh.db);

  try {
    await appRegistry.registerApp(
      api_server_id,
      "Example Frontend App",
      "App created in seeding for test",
      false,
      getAuthServerOwnerOrganizationId(),
      true
    );
    await appRegistry.addAppDomain(api_server_id, {
      app_id: api_server_id,
      app_domain_ref_id: api_server_id,
      created_at: now,
      hardcoded: false,
      environment,
      domain: url
    })
    await apiServerRegistry.registerApiServer(
      api_server_id,
      "Example Backend API",
      "API created in seeding for test",
      false,
      getAuthServerOwnerOrganizationId()
    );
    await apiServerRegistry.addApiServerDomain(api_server_id, {
      api_server_id,
      api_server_domain_ref_id: api_server_id,
      created_at: now,
      hardcoded: false,
      environment,
      domain: url
    })
    await appToApiRegistry.allow(api_server_id, api_server_id, null);

    await jwksRegistry.storeNewKey({
      api_server_id,
      created_at: now,
      key_id: api_server_id,
      key_algorithm: sign_verify_alg,
      is_active: true,
      public_key: jwks_access_public_key
    });
  } catch (e: unknown) {
    console.error("Error seeding database with sample app/API for usage in tests: ", e);
    return NextResponse.json({
      message: "Internal server error while seeding database with sample app/API for usage in tests!",
      error: true,
      success: false
    }, { status: 500 })
  }

  return NextResponse.json({
    message: "Successfully seeded database with sample app/API for usage in tests!",
    error: false,
    success: true
  }, { status: 200 });
}

export const runtime: ServerRuntime = "nodejs";
