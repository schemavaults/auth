import "server-only";

import {
  ServerlessDatabase,
  SchemaVaultsApiServerRegistry,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth";
import {
  type ListApiServersQueryResponse,
  listApiServersQueryTypeSchema,
  type ListApiServersQueryType,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

/**
 * List available SchemaVaults API servers
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ list_apis_query_type: string }> },
): Promise<NextResponse> {
  if (process.env.NODE_ENV === "development") {
    console.log("[/api/apis/list/[list_apis_query_type]] GET request received");
  }

  const parsed_query_type = await listApiServersQueryTypeSchema.safeParseAsync(
    (await props.params).list_apis_query_type,
  );
  if (!parsed_query_type.success) {
    if (process.env.NODE_ENV === "development")
      console.log("Invalid list API servers query type, not a string");
    return NextResponse.json(
      {
        success: false,
        message: "Invalid list API servers query type, not a string",
      } satisfies ListApiServersQueryResponse,
      {
        status: 400,
      },
    );
  }
  const list_apis_query_type: ListApiServersQueryType = parsed_query_type.data;

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[/api/apis/list/${list_apis_query_type}] Received GET request`,
    );
  }

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard =
      await RouteGuardFactory.getInstance().createGuardFromAuthHeader(
        list_apis_query_type === "all" ? "admin" : "authenticated",
        req.headers.get("Authorization") ??
          req.headers.get("authorization") ??
          null,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );
    const user: UserData | null = route_guard.user;
    if (!route_guard.isAccessAllowed() || !user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your access token does not grant you access to this resource",
        } satisfies ListApiServersQueryResponse,
        {
          status: 403,
        },
      );
    }
    userData = user;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message:
          "You must pass a valid access token in the Authorization header to use this resource",
      } satisfies ListApiServersQueryResponse,
      {
        status: 403,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

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
        if (typeof userData.admin !== "boolean" || !userData.admin) {
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
        let all_api_servers: SchemaVaultsApiServerDefinition[];
        try {
          all_api_servers = await apiServerRegistry.listApiServers(
            "all",
            userData,
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

        return NextResponse.json(
          {
            success: true,
            message: "Successfully listed all SchemaVaults API servers",
            list: all_api_servers,
          } satisfies ListApiServersQueryResponse,
          {
            status: 200,
          },
        );

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
}

export const dynamic = "force-dynamic"; // defaults to auto
