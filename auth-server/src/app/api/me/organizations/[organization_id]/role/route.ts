import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations";
import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function GET_my_organization_role_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext<"/api/me/organizations/[organization_id]/role">,
): Promise<NextResponse> {
  try {
    const { organization_id: raw_org_id } = await context.params;
    const parsed = organizationIdSchema.safeParse(raw_org_id);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid organization ID" },
        { status: 400 },
      );
    }
    const organization_id: OrganizationID = parsed.data;

    const admin: boolean = user.admin ?? false;
    const memberships = await listUserOrganizationMemberships(dbh.db, user.uid, admin);
    const membership = memberships.find((m) => m.organization_id === organization_id);

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "User is not a member of this organization" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Successfully retrieved user role in organization",
        data: {
          organization_id: membership.organization_id,
          role: membership.role,
        },
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_my_organization_role_handler.listUserOrganizationMemberships",
      route: "/api/me/organizations/[organization_id]/role",
      uid: user.uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to get user organization role" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, context: RouteContext<"/api/me/organizations/[organization_id]/role">): Promise<NextResponse> {
  return await (
    await withAuthenticatedApiRouteGuard(
      (inputs: IProtectedAuthenticatedApiRouteProps) =>
        GET_my_organization_role_handler(inputs, context),
    )
  )(req);
}
