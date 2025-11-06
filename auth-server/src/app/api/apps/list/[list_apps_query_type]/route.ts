import "server-only";

import {
  type AuthorizedAppDeclaration,
  AuthorizedAppsRegistry,
  SchemaVaultsAppRegistry,
  ServerlessDatabase,
  getDefinitionForAuthorizedDeclaration,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApp,
  type ListAppsQueryType,
  listAppsQueryTypeSchema,
  type ListAppsQueryResponse,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";
import type { UserData } from "@schemavaults/auth-common";

/**
 * List available SchemaVaults apps
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  input: { params: Promise<{ list_apps_query_type: string }> },
): Promise<NextResponse> {
  if (process.env.NODE_ENV === "development") {
    console.log("[/api/apps/list/[list_apps_query_type]] GET request received");
  }

  const parsed_query_type = await listAppsQueryTypeSchema.safeParseAsync(
    (await input.params).list_apps_query_type,
  );
  if (!parsed_query_type.success) {
    if (process.env.NODE_ENV === "development")
      console.log("Invalid list apps query type, not a string");
    return NextResponse.json(
      {
        success: false,
        message: "Invalid list apps query type, not a string",
      } satisfies ListAppsQueryResponse,
      {
        status: 400,
      },
    );
  }
  const list_apps_query_type: ListAppsQueryType = parsed_query_type.data;
  const type: ListAppsQueryType = list_apps_query_type;

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[/api/apps/list/${list_apps_query_type}] Received GET request`,
    );
  }

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard =
      await RouteGuardFactory.getInstance().createGuardFromAuthHeader(
        type === "all" ? "admin" : "authenticated",
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
        } satisfies ListAppsQueryResponse,
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
      } satisfies ListAppsQueryResponse,
      {
        status: 403,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let appsRegistry: SchemaVaultsAppRegistry;
  let authorizedAppsRegistry: AuthorizedAppsRegistry;
  try {
    appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
    authorizedAppsRegistry = new AuthorizedAppsRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load apps registry",
      } satisfies ListAppsQueryResponse,
      {
        status: 500,
      },
    );
  }

  try {
    switch (list_apps_query_type) {
      case "all":
        if (typeof userData.admin !== "boolean" || !userData.admin) {
          return NextResponse.json(
            {
              success: false,
              message: "You must be an admin to list all SchemaVaults apps",
            } satisfies ListAppsQueryResponse,
            {
              status: 403,
            },
          );
        }
        let all_apps: SchemaVaultsApp[];
        try {
          all_apps = await appsRegistry.listApps("all", userData);
        } catch (e: unknown) {
          console.error("Failed to list all apps:", e);
          return NextResponse.json(
            {
              success: false,
              message: "Failed to list all apps",
            } satisfies ListAppsQueryResponse,
            {
              status: 500,
            },
          );
        }

        return NextResponse.json(
          {
            success: true,
            message: "Successfully listed all SchemaVaults apps",
            list: all_apps,
          } satisfies ListAppsQueryResponse,
          {
            status: 200,
          },
        );

      case "public":
        const public_apps = await appsRegistry.listApps("public", userData);
        return NextResponse.json(
          {
            success: true,
            message:
              "Successfully listed all publicly-available SchemaVaults apps",
            list: public_apps,
          } satisfies ListAppsQueryResponse,
          {
            status: 200,
          },
        );

      case "authorized":
        if (process.env.NODE_ENV === "development") {
          console.log("Attempting to list authorized applications...");
        }

        const user_authorized_apps: AuthorizedAppDeclaration[] =
          await authorizedAppsRegistry.listAuthorizedAppsForUser(userData.uid);

        if (process.env.NODE_ENV === "development") {
          console.log(
            "Received list of authorization applications: ",
            user_authorized_apps,
          );
        }

        if (user_authorized_apps.length === 0) {
          return NextResponse.json(
            {
              success: true,
              message: "You have not authorized any applications",
              list: [],
            } satisfies ListAppsQueryResponse,
            {
              status: 200,
            },
          );
        }

        let authorized_apps_details: SchemaVaultsApp[];
        try {
          const loadAppDefinitionsForAuthorizedAppsPromises: Promise<SchemaVaultsApp>[] =
            user_authorized_apps.map(async function loadDefForApp(
              authorized_app: AuthorizedAppDeclaration,
            ): Promise<SchemaVaultsApp> {
              return await getDefinitionForAuthorizedDeclaration(
                authorized_app,
                appsRegistry,
              );
            });

          authorized_apps_details = await Promise.all(
            loadAppDefinitionsForAuthorizedAppsPromises,
          );
        } catch (e: unknown) {
          console.error(
            "Failed to load full app definitions for apps marked as authorized: ",
            e,
          );
          return NextResponse.json(
            {
              success: false,
              message:
                "Failed to load full app definitions for apps marked as authorized",
            } satisfies ListAppsQueryResponse,
            {
              status: 500,
            },
          );
        }

        return NextResponse.json(
          {
            success: true,
            message:
              "Successfully listed SchemaVaults apps that you have authorized",
            list: authorized_apps_details,
          } satisfies ListAppsQueryResponse,
          {
            status: 200,
          },
        );

      default:
        return NextResponse.json(
          {
            success: false,
            message: "Unsupported apps query type",
          } satisfies ListAppsQueryResponse,
          {
            status: 400,
          },
        );
    }
  } catch (e: unknown) {
    console.error("Failed to list SchemaVaults apps: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list SchemaVaults apps",
      } satisfies ListAppsQueryResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
