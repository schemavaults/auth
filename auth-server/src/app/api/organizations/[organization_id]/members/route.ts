import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry, type OrganizationMemberWithUserData } from "@/lib/auth-db/organizations";
import { type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";

interface RouteContext {
  params: Promise<{ organization_id: string }>;
}

async function GET_organization_members_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext,
): Promise<NextResponse> {
  const { organization_id: org_id_param } = await context.params;

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

  const registry = new OrganizationsRegistry(dbh.db);

  // Check access: user must be admin OR member of the organization
  if (!user.admin) {
    const userMembershipIds = await registry.listUserOrganizationMembershipIds(user.uid, user.admin ?? false);
    const isMember = userMembershipIds.includes(organization_id);
    if (!isMember) {
      return NextResponse.json(
        {
          success: false,
          message: "You do not have permission to view this organization's members!",
        },
        { status: 403 },
      );
    }
  }

  let members: readonly OrganizationMemberWithUserData[];
  try {
    members = await registry.listOrganizationMembers(organization_id);
  } catch (e: unknown) {
    console.error(`Failed to list organization members for '${organization_id}': `, e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list organization members!",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed organization members!",
      data: {
        members,
      },
    },
    { status: 200 },
  );
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return (await withAuthenticatedApiRouteGuard(
    (props) => GET_organization_members_handler(props, context),
  ))(req);
}
