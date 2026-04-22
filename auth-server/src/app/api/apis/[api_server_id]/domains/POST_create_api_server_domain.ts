import "server-only";

import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import {
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { ConflictError } from "@/lib/error/ConflictError";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  type ApiServerId,
  apiServerIdSchema,
  type SchemaVaultsApiServerDomainRef,
  schemaVaultsApiServerDomainRefSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]/domains";

/**
 * Create a new domain for an API server
 */
export async function POST_create_api_server_domain(
  request: NextRequest,
  ctx: RouteContext<'/api/apis/[api_server_id]/domains'>
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(params.api_server_id);
  if (!parsed_api_server_id.success) {
    console.error("Failed to parse api_server_id: ", parsed_api_server_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid API server id",
      },
      {
        status: 400,
      },
    );
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log(`[/api/apis/${api_server_id}/domains] POST request received`);
      }

      let apiServerRegistry: SchemaVaultsApiServerRegistry;
      try {
        apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "POST_create_api_server_domain.loadApiServersRegistry",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to API server registry",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }

      // Authorization: allow global admins, or org owners/admins for API servers belonging to their org
      if (!user.admin) {
        let authorized = false;
        try {
          const apiServerData = await apiServerRegistry.getApiServer(api_server_id);
          if (apiServerData && apiServerData.owner_organization_id) {
            const orgRegistry = new OrganizationsRegistry(dbh.db);
            const memberships = await orgRegistry.listUserOrganizationMemberships(user.uid, false);
            const membership = memberships.find(m => m.organization_id === apiServerData.owner_organization_id);
            if (membership && (membership.role === "owner" || membership.role === "admin")) {
              authorized = true;
            }
          }
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "POST_create_api_server_domain.checkOrgMembership",
            route: ROUTE,
            uid: user.uid,
            context: { api_server_id, nonFatal: true },
          });
        }

        if (!authorized) {
          return NextResponse.json(
            {
              success: false,
              message: "You must be an admin or organization owner to add a domain to an API server",
            } satisfies ResourceCreationResponse,
            {
              status: 403,
            },
          );
        }
      }

      let newResource: SchemaVaultsApiServerDomainRef;
      try {
        const parsed = await schemaVaultsApiServerDomainRefSchema.safeParseAsync(
          await req.json(),
        );
        if (!parsed.success) {
          throw parsed.error;
        }
        newResource = parsed.data;
        if (newResource.api_server_id !== api_server_id) {
          throw new Error("API server ID in body does not match API server ID from route params!");
        }
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse new API server domain details from request body";
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

      try {
        await apiServerRegistry.addApiServerDomain(newResource.api_server_id, newResource);

        return NextResponse.json({
          success: true,
          message: "Successfully added domain to API server",
          resource_id: newResource.api_server_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        if (e instanceof ConflictError) {
          return NextResponse.json(
            {
              success: false,
              message: e.message,
            } satisfies ResourceCreationResponse,
            { status: 409 },
          );
        }
        await captureServerException(dbh.db, e, {
          op_name: "POST_create_api_server_domain.addApiServerDomain",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to add domain to API server",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }
    },
  );
  const response = await protected_route(request);
  return applyCorsHeadersForSchemaVaultsWeb(response, request);
}

export default POST_create_api_server_domain;
