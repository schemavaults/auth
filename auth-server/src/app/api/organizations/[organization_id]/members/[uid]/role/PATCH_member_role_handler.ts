import "server-only";
import { NextResponse } from "next/server";
import type {
   IProtectedAuthenticatedApiRouteProps,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  isValidOrganizationMembershipRoleType,
  type OrganizationMembershipRoleType,
} from "@schemavaults/auth-common";
import { type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";
import isValidUuid from "@/lib/is-valid-uuid";

async function PATCH_member_role_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  organization_id: OrganizationID,
  target_uid: string,
  new_role: OrganizationMembershipRoleType
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

  // Validate role
  if (!isValidOrganizationMembershipRoleType(new_role)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid role provided! Must be 'owner' or 'member'.",
      },
      { status: 400 },
    );
  }

  // Cannot set role to 'admin' - that's only for virtual schemavaults memberships
  if (new_role === "admin") {
    return NextResponse.json(
      {
        success: false,
        message: "Cannot set role to 'admin'. Admin is a virtual role for schemavaults organization only.",
      },
      { status: 400 },
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  // Check authorization: user must be admin OR owner of the organization
  if (!user.admin) {
    const userMemberships = await registry.listUserOrganizationMemberships(user.uid, false);
    const userMembership = userMemberships.find(m => m.organization_id === organization_id);

    if (!userMembership || (userMembership.role !== "owner" && userMembership.role !== "admin")) {
      return NextResponse.json(
        {
          success: false,
          message: "You must be an organization owner/admin to change member roles!",
        },
        { status: 403 },
      );
    }
  }

  try {
    await registry.updateMemberRole(organization_id, target_uid, new_role);
  } catch (e: unknown) {
    console.error(`Failed to update member role: `, e);

    const errorMessage = e instanceof Error ? e.message : "Failed to update member role!";

    // Check for specific error messages
    if (errorMessage.includes("last owner")) {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot demote the last owner of an organization!",
        },
        { status: 400 },
      );
    }
    if (errorMessage.includes("No membership found")) {
      return NextResponse.json(
        {
          success: false,
          message: "User is not a member of this organization!",
        },
        { status: 404 },
      );
    }
    if (errorMessage.includes("hardcoded")) {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot update member roles in system organizations!",
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update member role!",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: `Successfully updated member role to '${new_role}'!`,
    },
    { status: 200 },
  );
}

export default PATCH_member_role_handler;
