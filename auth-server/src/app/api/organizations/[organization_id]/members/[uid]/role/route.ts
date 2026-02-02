import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  isValidOrganizationMembershipRoleType,
  type OrganizationMembershipRoleType,
} from "@/lib/auth-db/organizations/organization-membership-role-types";
import { type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";

interface RouteContext {
  params: Promise<{ organization_id: string; uid: string }>;
}

interface UpdateRoleRequestBody {
  role: OrganizationMembershipRoleType;
}

async function PATCH_member_role_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>,
  context: RouteContext,
  body: UpdateRoleRequestBody,
): Promise<NextResponse> {
  const { organization_id: org_id_param, uid: target_uid } = await context.params;

  // Validate organization_id
  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 },
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

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
  const new_role = body.role;
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

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  let body: UpdateRoleRequestBody;
  try {
    body = await req.json();
    if (typeof body !== "object" || !body || typeof body.role !== "string") {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid request body. Expected JSON with 'role' field.",
      },
      { status: 400 },
    );
  }

  return (await withAuthenticatedApiRouteGuard(
    (props) => PATCH_member_role_handler(props, context, body),
  ))(req);
}
