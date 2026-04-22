import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { JwksAccessKeysRegistry } from "@/lib/auth-db/jwks-access-keys";
import { apiServerIdSchema, SCHEMAVAULTS_AUTH_SERVER } from "@schemavaults/app-definitions";
import isUserInApiOwnerOrganization from "@/lib/isUserInApiOwnerOrganization";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]/jwks-access-key";

/**
 * PUT /api/apis/[api_server_id]/jwks-access-key
 * Regenerate JWKS access key - deactivates all old keys and creates a new one
 * Only organization owners can regenerate keys
 */
export async function PUT_regenerate_jwks_access_key(req: NextRequest, context: RouteContext<'/api/apis/[api_server_id]/jwks-access-key'>): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const params = await context.params;
      if (typeof params.api_server_id !== 'string') {
        return NextResponse.json(
          { success: false, message: "Invalid API server ID" },
          { status: 400 }
        );
      }
      const api_server_id: string = params.api_server_id;

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
            { success: false, message: "You must be a member of the owner organization to regenerate JWKS access keys" },
            { status: 403 }
          );
        }
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "PUT_regenerate_jwks_access_key.isUserInApiOwnerOrganization",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          { success: false, message: "Failed to verify authorization" },
          { status: 500 }
        );
      }

      // Regenerate key (deactivates old keys and creates new one)
      const jwksAccessKeysRegistry = new JwksAccessKeysRegistry(dbh.db);

      try {
        const { privateKey, keyId } = await jwksAccessKeysRegistry.regenerateKey(api_server_id);

        return NextResponse.json({
          success: true,
          message: "JWKS access key regenerated successfully. All previous keys have been deactivated. Save the new private key securely - it will not be shown again.",
          key_id: keyId,
          private_key: privateKey,
        });
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "PUT_regenerate_jwks_access_key.regenerateKey",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          { success: false, message: "Failed to regenerate JWKS access key" },
          { status: 500 }
        );
      }
    }
  );
  return await protected_route(req);
}

export default PUT_regenerate_jwks_access_key;
