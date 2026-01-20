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
  const isAdmin = false as const;
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
  const apiServer = await apiServerRegistry.getApiServer(api_server_id);

  if (!apiServer.owner_organization_id) {
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(dbh.db);
  const memberships = await organizationsRegistry.listUserOrganizationMemberships(uid, isAdmin satisfies boolean);

  return memberships.includes(apiServer.owner_organization_id);
}

/**
 * POST /api/apis/[api_server_id]/jwks-access-key/regenerate
 * Regenerate JWKS access key - deactivates all old keys and creates a new one
 * Only organization owners can regenerate keys
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment: _environment }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>) => {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const apisIndex = pathParts.indexOf("apis");
      const api_server_id = pathParts[apisIndex + 1];

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
            { success: false, message: "You must be a member of the owner organization to regenerate JWKS access keys" },
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
        console.error("Failed to regenerate JWKS access key:", e);
        return NextResponse.json(
          { success: false, message: "Failed to regenerate JWKS access key" },
          { status: 500 }
        );
      }
    }
  );
  return await protected_route(req);
}

export const dynamic = "force-dynamic";
