import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import isUserInApiOwnerOrganization from "@/lib/isUserInApiOwnerOrganization";
import type { JwksAccessKeyStatusQueryResponse } from '@/lib/auth-db/jwks-access-keys';
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]/jwks-access-key";
/**
 * POST /api/apis/[api_server_id]/jwks-access-key
 * Generate initial JWKS access key pair for an API server
 * Only organization owners can generate keys
 */
export async function POST_generate_jwks_access_key(request: NextRequest, ctx: RouteContext<"/api/apis/[api_server_id]/jwks-access-key">): Promise<NextResponse> {
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

      // Block JWKS access key management for the auth server's own API - it is the JWKS provider
      const auth_server_app_id = getAuthServerAppId();
      if (api_server_id === auth_server_app_id) {
        return NextResponse.json(
          { success: false, message: `JWKS access keys cannot be managed for the '${auth_server_app_id}' API server` },
          { status: 403 }
        );
      }

      // Verify user is in the owner organization
      try {
        const isAuthorized = await isUserInApiOwnerOrganization(user, api_server_id, dbh.db);
        if (!isAuthorized && !user.admin) {
          return NextResponse.json(
            { success: false, message: "You must be a member of the owner organization to manage JWKS access keys" },
            { status: 403 }
          );
        }
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "POST_generate_jwks_access_key.isUserInApiOwnerOrganization",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
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
        await captureServerException(dbh.db, e, {
          op_name: "POST_generate_jwks_access_key.generateNewKeyForAudience",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          { success: false, message: "Failed to generate JWKS access key" },
          { status: 500 }
        );
      }
    }
  );
  return await protected_route(request);
}

export default POST_generate_jwks_access_key;
