import "server-only";
import { NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  OrganizationsRegistry,
} from "@/lib/auth-db";
import {
  IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

async function GET_list_organizations_handler({
  user,
  dbh,
}: IProtectedAdminApiRouteProps): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to use this resource!",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  let organizations: readonly OrganizationDefinition[];
  try {
    const registry = new OrganizationsRegistry(dbh.db);
    organizations = await registry.listAllOrganizations();
  } catch (e: unknown) {
    console.error("Failed to list all organizations: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list all organizations!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed all organizations!",
      data: {
        organizations,
      },
    },
    {
      status: 200,
    },
  );
}

export const GET = withAdminApiRouteGuard(GET_list_organizations_handler);
