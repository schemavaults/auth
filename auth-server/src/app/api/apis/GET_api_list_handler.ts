import "server-only";

import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db";
import {
  type ListApiServersQueryResponse,
  listApiServersQueryTypeSchema,
  type ListApiServersQueryType,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";

/**
 * List available SchemaVaults API servers
 */
async function GET_api_list_handler(
  req: NextRequest,
): Promise<NextResponse> {
  const searchParams: URLSearchParams = req.nextUrl.searchParams;

  const parsed_query_type = await listApiServersQueryTypeSchema.safeParseAsync(
    searchParams.get('list_apis_query_type'),
  );
  if (!parsed_query_type.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid list API servers query type",
      } satisfies ListApiServersQueryResponse,
      {
        status: 400,
      },
    );
  }
  const list_apis_query_type: ListApiServersQueryType = parsed_query_type.data;

  const protected_route = withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log(
          `[/api/apis] GET request received`,
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
            message: "Failed to connect to API servers registry",
          } satisfies ListApiServersQueryResponse,
          {
            status: 500,
          },
        );
      }

      try {
        switch (list_apis_query_type) {
          case "all":
            if (!user.admin) {
              return NextResponse.json(
                {
                  success: false,
                  message:
                    "You must be an admin to list all SchemaVaults API servers",
                } satisfies ListApiServersQueryResponse,
                {
                  status: 403,
                },
              );
            }
            try {
              return NextResponse.json(
                {
                  success: true,
                  message: "Successfully listed all SchemaVaults API servers",
                  list: (await apiServerRegistry.listApiServers(
                    "all",
                    user,
                  )) satisfies SchemaVaultsApiServerDefinition[],
                } satisfies ListApiServersQueryResponse,
                {
                  status: 200,
                },
              );
            } catch (e: unknown) {
              console.error(e);
              return NextResponse.json(
                {
                  success: false,
                  message: "Failed to list all API servers",
                } satisfies ListApiServersQueryResponse,
                {
                  status: 500,
                },
              );
            }

          default:
            return NextResponse.json(
              {
                success: false,
                message: "Unsupported API servers query type",
              } satisfies ListApiServersQueryResponse,
              {
                status: 400,
              },
            );
        }
      } catch (e: unknown) {
        console.error("Failed to list SchemaVaults API servers: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to list SchemaVaults API servers",
          } satisfies ListApiServersQueryResponse,
          {
            status: 500,
          },
        );
      }
    },
  );

  return await protected_route(req);
}

export default GET_api_list_handler;
