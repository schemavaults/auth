import "server-only";

import { NextResponse } from "next/server";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

export const GET = withAuthenticatedApiRouteGuard(async ({ user, dbh }) => {
  const organizationsRegistry = new OrganizationsRegistry(dbh.db);

  const organizationIds = await organizationsRegistry.listUserOrganizationMemberships(user.uid);

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
