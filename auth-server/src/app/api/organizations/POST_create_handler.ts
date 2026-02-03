import "server-only";

import type { ResourceCreationResponse } from "@/lib/auth-db";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  createOrganization,
  addOrganizationMembership,
  hasUserExceededMaximumOrgMemberships,
} from "@/lib/auth-db/organizations";
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

class ExceededMembershipLimitError extends Error {}

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

  newOrganization['created_by'] = user.uid;

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

  const organization_id = newOrganization.organization_id;
  const uid: string = user.uid;

  try {
    await dbh.db.transaction().execute(async (trx) => {
      const exceededLimit: boolean = await hasUserExceededMaximumOrgMemberships(trx, uid);
      if (exceededLimit) {
        throw new ExceededMembershipLimitError();
      }

      await createOrganization(trx, newOrganization);
      // Add the creating user as owner of the organization
      await addOrganizationMembership(trx, organization_id, uid, "owner");
    })
  } catch (e: unknown) {
    console.error("Failed to create organization: ", e);
    if (e instanceof ExceededMembershipLimitError) {
      return NextResponse.json(
        {
          success: false,
          message: `You have reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}). Please leave an organization before creating a new one.`,
        } satisfies ResourceCreationResponse,
        {
          status: 409,
        },
      );
    }

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

  return NextResponse.json({
    success: true,
    message: "Successfully created new organization",
    resource_id: newOrganization.organization_id,
  } satisfies ResourceCreationResponse);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(POST_create_organization_handler))(req)
}

export const dynamic = "force-dynamic";
