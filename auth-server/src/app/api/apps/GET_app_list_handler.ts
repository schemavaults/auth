import "server-only";

import {
  type AuthorizedAppDeclaration,
  AuthorizedAppsRegistry,
  SchemaVaultsAppRegistry,
  getDefinitionForAuthorizedDeclaration,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApp,
  type ListAppsQueryType,
  listAppsQueryTypeSchema,
  type ListAppsQueryResponse,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import type { UserData } from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";

async function listAuthorizedAppsForUser(
  appsRegistry: SchemaVaultsAppRegistry,
  authorizedAppsRegistry: AuthorizedAppsRegistry,
  userData: UserData,
): Promise<NextResponse<ListAppsQueryResponse>> {
  const user_authorized_apps: AuthorizedAppDeclaration[] =
    await authorizedAppsRegistry.listAuthorizedAppsForUser(userData.uid);

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
      message: "Successfully listed SchemaVaults apps that you have authorized",
      list: authorized_apps_details,
    } satisfies ListAppsQueryResponse,
    {
      status: 200,
    },
  );
}

/**
 * List available SchemaVaults apps
 */
export async function GET_app_list_handler(
  req: NextRequest,
): Promise<NextResponse> {
  const searchParams: URLSearchParams = req.nextUrl.searchParams;

  const parsed_query_type = await listAppsQueryTypeSchema.safeParseAsync(
    searchParams.get("list_apps_query_type"),
  );
  if (!parsed_query_type.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid list apps query type",
      } satisfies ListAppsQueryResponse,
      {
        status: 400,
      },
    );
  }
  const list_apps_query_type: ListAppsQueryType = parsed_query_type.data;

  const protected_route = withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log("[/api/apps] GET request received");
      }

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
            if (!user.admin) {
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
            try {
              return NextResponse.json(
                {
                  success: true,
                  message: "Successfully listed all SchemaVaults apps",
                  list: await appsRegistry.listApps("all", user),
                } satisfies ListAppsQueryResponse,
                {
                  status: 200,
                },
              );
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

          case "public":
            try {
              return NextResponse.json(
                {
                  success: true,
                  message:
                    "Successfully listed all publicly-available SchemaVaults apps",
                  list: await appsRegistry.listApps("public", user),
                } satisfies ListAppsQueryResponse,
                {
                  status: 200,
                },
              );
            } catch (e: unknown) {
              console.error("Failed to list public apps:", e);
              return NextResponse.json(
                {
                  success: false,
                  message: "Failed to list public apps",
                } satisfies ListAppsQueryResponse,
                {
                  status: 500,
                },
              );
            }

          case "authorized":
            try {
              return await listAuthorizedAppsForUser(
                appsRegistry,
                authorizedAppsRegistry,
                user,
              );
            } catch (e: unknown) {
              console.error("Failed to list authorized apps for user:", e);
              return NextResponse.json(
                {
                  success: false,
                  message: "Failed to list authorized apps for user",
                } satisfies ListAppsQueryResponse,
                {
                  status: 500,
                },
              );
            }

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
    },
  );

  return await protected_route(req);
}

export const dynamic = "force-dynamic"; // defaults to auto
