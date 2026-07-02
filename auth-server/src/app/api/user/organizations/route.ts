import "server-only";

import { connection, type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import captureServerException from "@/lib/captureServerException";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await connection();
  const protected_route = await withAuthenticatedApiRouteGuard(async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
    const organizationsRegistry = new OrganizationsRegistry(dbh.db);

    const organizationIds = await organizationsRegistry.listUserOrganizationMembershipIds(user.uid, user.admin ?? false);

    const organizations: OrganizationDefinition[] = [];
    for (const orgId of organizationIds) {
      try {
        const org = await organizationsRegistry.lookupOrganization(orgId);
        organizations.push(org);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_user_organizations.lookupOrganization",
          route: "/api/user/organizations",
          uid: user.uid,
          context: { organization_id: orgId, nonFatal: true },
        });
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

export const dynamic = "force-dynamic";
