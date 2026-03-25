import "server-only";
import { NextResponse } from "next/server";
import type {
   IProtectedAuthenticatedApiRouteProps,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import { type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/lib/is-valid-uuid";

async function GET_member_role_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  organization_id: OrganizationID,
  target_uid: string,
): Promise<NextResponse> {

  // Validate organization_id
  const parsed_org_id = await organizationIdSchema.safeParseAsync(organization_id);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 },
    );
  }

  // Validate target uid
  if (!isValidUuid(target_uid)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid user ID provided!",
      },
      { status: 400 },
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  // Check authorization: user must be admin OR a member of the organization
  if (!user.admin) {
    const userMembershipIds = await registry.listUserOrganizationMembershipIds(user.uid, user.admin ?? false);
    const isMember = userMembershipIds.includes(organization_id);
    if (!isMember) {
      return NextResponse.json(
        {
          success: false,
          message: "You do not have permission to view this organization's member roles!",
        },
        { status: 403 },
      );
    }
  }

  // Look up the target user's membership in this organization
  const targetMemberships = await registry.listUserOrganizationMemberships(target_uid, false);
  const targetMembership = targetMemberships.find(m => m.organization_id === organization_id);

  if (!targetMembership) {
    return NextResponse.json(
      {
        success: false,
        message: "User is not a member of this organization!",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully retrieved member role!",
      data: {
        role: targetMembership.role,
      },
    },
    { status: 200 },
  );
}

export default GET_member_role_handler;
