import "server-only";
import { connection, NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry, type OrganizationMemberWithUserData } from "@/lib/auth-db/organizations";
import { type OrganizationID, organizationIdSchema } from "@schemavaults/auth-common";
import captureServerException from "@/lib/captureServerException";

async function GET_organization_members_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext<"/api/organizations/[organization_id]/members">,
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
    await captureServerException(dbh.db, e, {
      op_name: "GET_organization_members_handler.listOrganizationMembers",
      route: "/api/organizations/[organization_id]/members",
      uid: user.uid,
      context: { organization_id },
    });
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

export async function GET(req: NextRequest, context: RouteContext<"/api/organizations/[organization_id]/members">): Promise<NextResponse> {
  await connection();
  const handler = await withAuthenticatedApiRouteGuard(
    (props) => GET_organization_members_handler(props, context),
  );

  return await handler(req);
}

export const dynamic = "force-dynamic"; // defaults to auto
