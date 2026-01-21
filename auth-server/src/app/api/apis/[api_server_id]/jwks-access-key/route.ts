import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

async function isUserInOwnerOrganization(
  uid: string,
  api_server_id: string,
  dbh: Parameters<typeof withAuthenticatedApiRouteGuard>[0] extends (props: infer P) => unknown ? P extends { dbh: infer D } ? D : never : never
): Promise<boolean> {
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
  const apiServer = await apiServerRegistry.getApiServer(api_server_id);

  if (!apiServer.owner_organization_id) {
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(dbh.db);
  const memberships = await organizationsRegistry.listUserOrganizationMemberships(uid);

  return memberships.includes(apiServer.owner_organization_id);
}

/**
 * POST /api/apis/[api_server_id]/jwks-access-key
 * Generate initial JWKS access key pair for an API server
 * Only organization owners can generate keys
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment: _environment }) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const api_server_id = pathParts[pathParts.indexOf("apis") + 1];

      if (!api_server_id || !apiServerIdSchema.safeParse(api_server_id).success) {
        return NextResponse.json(
          { success: false, message: "Invalid API server ID" },
          { status: 400 }
        );
      }

      // Verify user is in the owner organization
      try {
        const isAuthorized = await isUserInOwnerOrganization(user.uid, api_server_id, dbh);
        if (!isAuthorized && !user.admin) {
          return NextResponse.json(
            { success: false, message: "You must be a member of the owner organization to manage JWKS access keys" },
            { status: 403 }
          );
        }
      } catch (e: unknown) {
        console.error("Failed to verify user authorization:", e);
        return NextResponse.json(
          { success: false, message: "Failed to verify authorization" },
          { status: 500 }
        );
      }

      // Check if a key already exists
      const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(dbh.db);
      const existingKey = await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);

      if (existingKey) {
        return NextResponse.json(
          { success: false, message: "A JWKS access key already exists. Use the regenerate endpoint to create a new one." },
          { status: 409 }
        );
      }

      // Generate new key pair
      try {
        const { privateKey, keyId } = await jwksAccessKeysRegistry.generateNewKeyForAudience(api_server_id);

        return NextResponse.json({
          success: true,
          message: "JWKS access key generated successfully. Save the private key securely - it will not be shown again.",
          key_id: keyId,
          private_key: privateKey,
        });
      } catch (e: unknown) {
        console.error("Failed to generate JWKS access key:", e);
        return NextResponse.json(
          { success: false, message: "Failed to generate JWKS access key" },
          { status: 500 }
        );
      }
    }
  );
  return await protected_route(request);
}

/**
 * GET /api/apis/[api_server_id]/jwks-access-key
 * Get key metadata (not the actual keys)
 * Only organization owners can view key metadata
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment: _environment }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const api_server_id = pathParts[pathParts.indexOf("apis") + 1];

      if (!api_server_id || !apiServerIdSchema.safeParse(api_server_id).success) {
        return NextResponse.json(
          { success: false, message: "Invalid API server ID" },
          { status: 400 }
        );
      }

      // Verify user is in the owner organization
      try {
        const isAuthorized = await isUserInOwnerOrganization(user.uid, api_server_id, dbh);
        if (!isAuthorized && !user.admin) {
          return NextResponse.json(
            { success: false, message: "You must be a member of the owner organization to view JWKS access keys" },
            { status: 403 }
          );
        }
      } catch (e: unknown) {
        console.error("Failed to verify user authorization:", e);
        return NextResponse.json(
          { success: false, message: "Failed to verify authorization" },
          { status: 500 }
        );
      }

      // Get key metadata
      const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(dbh.db);
      const keyMetadata = await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);

      if (!keyMetadata) {
        return NextResponse.json({
          success: true,
          has_key: false,
          key: null,
        });
      }

      return NextResponse.json({
        success: true,
        has_key: true,
        key: keyMetadata,
      });
    }
  );
  return await protected_route(request);
}

export const dynamic = "force-dynamic";
