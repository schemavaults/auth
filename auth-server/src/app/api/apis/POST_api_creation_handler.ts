import "server-only";

import {
  SchemaVaultsApiServerRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID } from "@schemavaults/auth-common";

/**
 * Create a new API server
 */
export default async function POST_api_creation_handler(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log("[/api/apis] POST request received");
      }

      let newResource: SchemaVaultsApiServerDefinition;
      try {
        const parsed =
          await schemaVaultsApiServerDefinitionSchema.refine(function noHardcodedApiServers(values) {
            return typeof values.hardcoded === 'boolean' && !values.hardcoded
          }, "Hardcoded API server definitions may not be dynamically created at this endpoint.").safeParseAsync(
            await req.json(),
          );
        if (!parsed.success) throw parsed.error;
        newResource = parsed.data;
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse new SchemaVaults API server details from request body";
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

      let owner_organization_id: OrganizationID | null | undefined = newResource.owner_organization_id;

      // If owner_organization_id is specified, verify user has access
      if (owner_organization_id) {
        const hasAccess = await isUserInOrganization(
          user,
          owner_organization_id satisfies OrganizationID,
          dbh.db
        );
        if (!hasAccess && !user.admin) {
          return NextResponse.json(
            {
              success: false,
              message: "You must be a member of the organization to create API servers for it",
            } satisfies ResourceCreationResponse,
            {
              status: 403,
            },
          );
        }
      } else {
        // If no owner_organization_id, only admins can create API servers
        if (!user.admin) {
          return NextResponse.json(
            {
              success: false,
              message:
                "You must be an admin to create a new SchemaVaults API server without an organization",
            } satisfies ResourceCreationResponse,
            {
              status: 403,
            },
          );
        } else {
          // User is an admin, and no owner_organization_id has been set-- default to 'schemavaults' org
          owner_organization_id = SCHEMAVAULTS_ORGANIZATION_ID;
        }
      }

      let apiServerRegistry: SchemaVaultsApiServerRegistry;
      try {
        apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
      } catch (e: unknown) {
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to API servers registry",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }

      try {
        await apiServerRegistry.registerApiServer(
          newResource.api_server_id,
          newResource.api_server_name,
          newResource.api_server_description,
          newResource.public satisfies boolean,
          owner_organization_id,
        );

        return NextResponse.json({
          success: true,
          message: "Successfully created new SchemaVaults API server",
          resource_id: newResource.api_server_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        console.error("Failed to create SchemaVaults API server: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to create new SchemaVaults API server",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }
    },
  );
  return await protected_route(request);
}
