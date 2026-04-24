import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { apiServerIdSchema, SCHEMAVAULTS_AUTH_SERVER } from "@schemavaults/app-definitions";
import isUserInApiOwnerOrganization from "@/lib/isUserInApiOwnerOrganization";
import type { JwksAccessKeyStatusQueryResponse } from '@/lib/auth-db/jwks-access-keys';
import captureServerException from "@/lib/captureServerException";

/**
 * GET /api/apis/[api_server_id]/jwks-access-key
 * Get key metadata (not the actual keys)
 * Only organization owners can view key metadata
 */
export async function GET_jwks_access_key_metadata(request: NextRequest, ctx: RouteContext<"/api/apis/[api_server_id]/jwks-access-key">): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
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
        const isAuthorized = await isUserInApiOwnerOrganization(user, api_server_id, dbh.db);
        if (!isAuthorized && !user.admin) {
          return NextResponse.json(
            { success: false, message: "You must be a member of the owner organization to view JWKS access keys" },
            { status: 403 }
          );
        }
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_jwks_access_key_metadata.isUserInApiOwnerOrganization",
          route: "/api/apis/[api_server_id]/jwks-access-key",
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          { success: false, message: "Failed to verify authorization" },
          { status: 500 }
        );
      }

      // Get key metadata
      const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(dbh.db);
      const keyMetadata: JwksAccessKeyStatusQueryResponse | null = await jwksAccessKeysRegistry.getKeyMetadata(api_server_id);

      if (!keyMetadata) {
        return NextResponse.json({
          success: true,
          key_metadata: false
        });
      }

      return NextResponse.json({
        success: true,
        key_metadata: keyMetadata satisfies JwksAccessKeyStatusQueryResponse
      });
    }
  );
  return await protected_route(request);
}

export default GET_jwks_access_key_metadata;
