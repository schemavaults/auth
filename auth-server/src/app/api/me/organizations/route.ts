import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { listUserOrganizationMemberships, OrganizationsRegistry } from "@/lib/auth-db/organizations";
import type { OrganizationMembershipRoleDefinition } from "@/lib/auth-db/organizations";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";

export interface UserOrganizationMembershipWithDefinition {
  organization_id: string;
  organization_name: string;
  role: string;
  created_at: number;
}

async function GET_my_organizations_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
): Promise<NextResponse> {
  try {
    const admin: boolean = user.admin ?? false;
    const memberships: readonly OrganizationMembershipRoleDefinition[] =
      await listUserOrganizationMemberships(dbh.db, user.uid, admin);

    const organizationsRegistry = new OrganizationsRegistry(dbh.db);

    const enrichedResults = await Promise.allSettled(
      memberships.map(async (membership): Promise<UserOrganizationMembershipWithDefinition> => {
        const orgDef: OrganizationDefinition =
          await organizationsRegistry.lookupOrganization(membership.organization_id);
        return {
          organization_id: membership.organization_id,
          organization_name: orgDef.name,
          role: membership.role,
          created_at: membership.created_at,
        };
      }),
    );

    const enrichedMemberships: UserOrganizationMembershipWithDefinition[] = [];
    for (const [i, result] of enrichedResults.entries()) {
      if (result.status === "fulfilled") {
        enrichedMemberships.push(result.value);
      } else {
        const failedMembership = memberships[i];
        console.error(
          `Failed to enrich membership for org ${failedMembership?.organization_id ?? "unknown"}:`,
          result.reason,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Successfully listed user organization memberships",
        data: {
          memberships: enrichedMemberships,
        },
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    console.error("Failed to list user organization memberships:", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list user organization memberships",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(GET_my_organizations_handler))(req);
}
