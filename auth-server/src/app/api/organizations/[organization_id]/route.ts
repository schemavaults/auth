import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  type OrganizationID,
  organizationIdSchema,
  hardcodedOrgs,
} from "@schemavaults/auth-common";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/organizations/[organization_id]";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ organization_id: string }>;
}

async function DELETE_organization_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps,
  context: RouteContext
): Promise<NextResponse> {
  const { organization_id: org_id_param } = await context.params;

  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid organization ID provided!",
      },
      { status: 400 }
    );
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  // Block deletion of hardcoded organizations
  const isHardcoded = hardcodedOrgs.some(
    (org) => org.organization_id === organization_id
  );
  if (isHardcoded) {
    return NextResponse.json(
      {
        success: false,
        message: "Cannot delete a system organization!",
      },
      { status: 403 }
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  // Check authorization: user must be global admin OR owner of the organization
  const isGlobalAdmin = user.admin === true;

  if (!isGlobalAdmin) {
    const userMemberships = await registry.listUserOrganizationMemberships(
      user.uid,
      false
    );
    const userMembership = userMemberships.find(
      (m) => m.organization_id === organization_id
    );

    if (!userMembership || userMembership.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          message: "Only organization owners or global admins can delete organizations",
        },
        { status: 403 }
      );
    }
  }

  // Verify organization exists before deletion
  try {
    await registry.lookupOrganization(organization_id);
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Organization not found",
      },
      { status: 404 }
    );
  }

  // Delete the organization
  try {
    const result = await registry.deleteOrganization(organization_id);

    if (!result.success) {
      // Determine appropriate status code based on the error message
      if (result.message === "Organization not found") {
        return NextResponse.json(
          {
            success: false,
            message: result.message,
          },
          { status: 404 }
        );
      }
      if (result.message === "Cannot delete a hardcoded organization!") {
        return NextResponse.json(
          {
            success: false,
            message: result.message,
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          message: result.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_organization_handler.deleteOrganization",
      route: ROUTE,
      uid: user.uid,
      context: { organization_id },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete organization",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return (
    await withAuthenticatedApiRouteGuard((props) =>
      DELETE_organization_handler(props, context)
    )
  )(req);
}
