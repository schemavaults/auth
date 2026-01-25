import "server-only";

import {
  OrganizationsRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  hardcodedOrgs,
  type OrganizationDefinition,
  organizationDefinitionSchema,
} from "@schemavaults/auth-common";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

async function POST_create_organization_handler({
  req,
  user,
  dbh,
  environment,
}: IProtectedAdminApiRouteProps<AuthDatabase>): Promise<NextResponse> {
  if (environment === "development") {
    console.log("POST => /api/organizations");
  }

  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to create a new organization",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  // Parse new organization definitions from request body
  let newOrganization: OrganizationDefinition;
  try {
    const parsed = await organizationDefinitionSchema.safeParseAsync(
      await req.json(),
    );
    if (!parsed.success) throw parsed.error;
    newOrganization = parsed.data;
  } catch (e: unknown) {
    const errorMessage =
      "Failed to parse organization details from request body";
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  // Ensure new organization definition is not a reserved organization ID
  if (hardcodedOrgs.some(hardcodedOrganization => hardcodedOrganization.organization_id === newOrganization.organization_id)) {
    return NextResponse.json(
      {
        success: false,
        message: "Attempting to create an organization with a reserved ID",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  let orgRegistry: OrganizationsRegistry;
  try {
    orgRegistry = new OrganizationsRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to organizations registry",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  try {
    await orgRegistry.createOrganization(newOrganization);

    // Add the creating admin as owner of the organization
    await orgRegistry.addMembership(
      newOrganization.organization_id,
      user.uid,
      "owner",
    );

    return NextResponse.json({
      success: true,
      message: "Successfully created new organization",
      resource_id: newOrganization.organization_id,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to create organization: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create new organization",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(POST_create_organization_handler))(req)
}

export const dynamic = "force-dynamic";
