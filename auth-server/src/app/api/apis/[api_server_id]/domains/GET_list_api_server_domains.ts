import "server-only";

import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import {
  type ApiServerId,
  type SchemaVaultsApiServerDomainRef,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import isUserInApiOwnerOrganization from "@/lib/isUserInApiOwnerOrganization";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]/domains";

export type ListApiServerDomainsResponse =
  | {
      success: true;
      message: string;
      list: readonly SchemaVaultsApiServerDomainRef[];
    }
  | {
      success: false;
      message: string;
    };

/**
 * List available domains for a SchemaVaults API server
 */
export async function GET_list_api_server_domains(
  req: NextRequest,
  ctx: RouteContext<'/api/apis/[api_server_id]/domains'>,
): Promise<NextResponse> {
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the API server id was well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      const params = await ctx.params;

      const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(params.api_server_id);
      if (!parsed_api_server_id.success) {
        console.error("Failed to parse api_server_id: ", parsed_api_server_id.error);
        return NextResponse.json(
          {
            success: false,
            message: "Invalid API server id, not a string",
          } satisfies ListApiServerDomainsResponse,
          {
            status: 400,
          },
        );
      }
      const api_server_id: ApiServerId = parsed_api_server_id.data;

      if (environment === "development") {
        console.log(`[/api/apis/${api_server_id}/domains] GET request received`);
      }

      let apiServerRegistry: SchemaVaultsApiServerRegistry;
      try {
        apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_list_api_server_domains.loadApiServersRegistry",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to API server registry",
          } satisfies ListApiServerDomainsResponse,
          {
            status: 500,
          },
        );
      }

      const apiServer = await apiServerRegistry.getApiServer(api_server_id);
      if (!apiServer) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load API server with given 'api_server_id'",
          } satisfies ListApiServerDomainsResponse,
          {
            status: 404,
          },
        );
      }

      if (!user.admin) {
        let authorized = false;
        try {
          authorized = await isUserInApiOwnerOrganization(
            user,
            api_server_id,
            dbh.db,
            ['owner', 'admin', 'member'],
          );
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_list_api_server_domains.isUserInApiOwnerOrganization",
            route: ROUTE,
            uid: user.uid,
            context: { api_server_id, nonFatal: true },
          });
        }
        if (!authorized) {
          return NextResponse.json(
            {
              success: false,
              message: "You are not authorized to list domains for this API server",
            } satisfies ListApiServerDomainsResponse,
            {
              status: 403,
            },
          );
        }
      }

      try {
        const domains = await apiServerRegistry.getApiServerDomains(api_server_id);
        return NextResponse.json({
          success: true,
          message: "Domains successfully listed",
          list: domains,
        } satisfies ListApiServerDomainsResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_list_api_server_domains.getApiServerDomains",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to list domains for API server",
          } satisfies ListApiServerDomainsResponse,
          {
            status: 500,
          },
        );
      }
    },
  );

  return await protected_route(req);
}

export default GET_list_api_server_domains;
