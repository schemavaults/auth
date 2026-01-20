import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
    const organizationsRegistry = new OrganizationsRegistry(dbh.db);

    const organizationIds = await organizationsRegistry.listUserOrganizationMemberships(user.uid, user.admin ?? false);

    const organizations: OrganizationDefinition[] = [];
    for (const orgId of organizationIds) {
      try {
        const org = await organizationsRegistry.lookupOrganization(orgId);
        organizations.push(org);
      } catch (e: unknown) {
        console.error(`Failed to lookup organization ${orgId}:`, e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        organizations,
      },
      {
        status: 200,
      },
    );
  });
  return await protected_route(req);
}
