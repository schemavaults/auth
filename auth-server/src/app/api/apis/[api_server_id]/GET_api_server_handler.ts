import "server-only";

import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import {
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { type OrganizationID } from "@schemavaults/auth-common";

export type GetApiServerResponse =
  | {
      success: true;
      api_server: SchemaVaultsApiServerDefinition;
    }
  | {
      success: false;
      message: string;
    };

/**
 * Load a single API server definition by ID
 */
export async function GET_api_server_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apis/[api_server_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
    params.api_server_id,
  );
  if (!parsed_api_server_id.success) {
    console.error(
      "Failed to parse api_server_id: ",
      parsed_api_server_id.error,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Invalid api_server_id parameter",
      } satisfies GetApiServerResponse,
      { status: 400 },
    );
  }
  const api_server_id: ApiServerId = parsed_api_server_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log(
          `[/api/apis/${api_server_id}] GET request received`,
        );
      }

      let apiServerRegistry: SchemaVaultsApiServerRegistry;
      try {
        apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
      } catch (e: unknown) {
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to API server registry",
          } satisfies GetApiServerResponse,
          { status: 500 },
        );
      }

      let apiServer: SchemaVaultsApiServerDefinition | null;
      try {
        apiServer = await apiServerRegistry.getApiServer(api_server_id);
      } catch (e: unknown) {
        console.error("Failed to load API server: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load API server",
          } satisfies GetApiServerResponse,
          { status: 500 },
        );
      }

      if (!apiServer) {
        return NextResponse.json(
          {
            success: false,
            message: "API server not found",
          } satisfies GetApiServerResponse,
          { status: 404 },
        );
      }

      if (!apiServer.public && !user.admin) {
        let authorized = false;
        if (apiServer.owner_organization_id) {
          authorized = await isUserInOrganization(
            user,
            apiServer.owner_organization_id as OrganizationID,
            dbh.db,
          );
        }
        if (!authorized) {
          return NextResponse.json(
            {
              success: false,
              message: "You are not authorized to view this API server",
            } satisfies GetApiServerResponse,
            { status: 403 },
          );
        }
      }

      return NextResponse.json({
        success: true,
        api_server: apiServer,
      } satisfies GetApiServerResponse);
    },
  );

  return await protected_route(req);
}

export default GET_api_server_handler;
