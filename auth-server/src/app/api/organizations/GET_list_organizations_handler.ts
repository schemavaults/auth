import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  OrganizationsRegistry,
} from "@/lib/auth-db";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

async function GET_list_organizations_handler({
  user,
  dbh,
}: IProtectedAdminApiRouteProps): Promise<NextResponse> {
  if (!user) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load your user data in API route handler.",
      } satisfies ResourceCreationResponse,
      {
        status: 401,
      },
    );
  }

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(GET_list_organizations_handler))(req);
}
