import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { apiServerIdSchema, SCHEMAVAULTS_AUTH_SERVER } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isUserInApiOwnerOrganization from "@/lib/isUserInApiOwnerOrganization";
import type { JwksAccessKeyStatusQueryResponse } from '@/lib/auth-db/jwks-access-keys';
/**
 * POST /api/apis/[api_server_id]/jwks-access-key
 * Generate initial JWKS access key pair for an API server
 * Only organization owners can generate keys
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/apis/[api_server_id]/jwks-access-key">): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }) => {
      const params = await ctx.params;
      const api_server_id = params.api_server_id;

      if (!api_server_id || !apiServerIdSchema.safeParse(api_server_id).success) {
        return NextResponse.json(
          { success: false, message: "Invalid API server ID" },
          { status: 400 }
        );
      }

      // Block JWKS access key management for schemavaults-auth - it is the JWKS provider
      if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
        return NextResponse.json(
          { success: false, message: "JWKS access keys cannot be managed for the schemavaults-auth API server" },
          { status: 403 }
        );
      }

      // Verify user is in the owner organization
      try {
        const isAuthorized = await isUserInApiOwnerOrganization(user.uid, api_server_id, dbh.db);
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
      const existingKey: JwksAccessKeyStatusQueryResponse | null = await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);

      if (existingKey) {
        return NextResponse.json(
          {
            success: false,
            message: "A JWKS access key already exists. Use the regenerate endpoint to create a new one."
          },
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
export async function GET(request: NextRequest, ctx: RouteContext<"/api/apis/[api_server_id]/jwks-access-key">): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>) => {
      const params = await ctx.params;
      const api_server_id = params.api_server_id;

      if (!api_server_id || !apiServerIdSchema.safeParse(api_server_id).success) {
        return NextResponse.json(
          { success: false, message: "Invalid API server ID" },
          { status: 400 }
        );
      }

      // Block JWKS access key management for schemavaults-auth - it is the JWKS provider
      if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
        return NextResponse.json(
          { success: false, message: "JWKS access keys cannot be managed for the schemavaults-auth API server" },
          { status: 403 }
        );
      }

      // Verify user is in the owner organization
      try {
        const isAuthorized = await isUserInApiOwnerOrganization(user.uid, api_server_id, dbh.db);
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
          key_metadata: false
        });
      }

      return NextResponse.json({
        success: true,
        key_metadata: keyMetadata,
      });
    }
  );
  return await protected_route(request);
}

export const dynamic = "force-dynamic";
