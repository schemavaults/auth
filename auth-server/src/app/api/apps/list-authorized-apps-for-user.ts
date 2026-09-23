import "server-only";

import {
  type AuthorizedAppDeclaration,
  type AuthorizedAppsRegistry,
  type SchemaVaultsAppRegistry,
  getDefinitionForAuthorizedDeclaration,
} from "@/lib/auth-db";
import type { SchemaVaultsApp, ListAppsQueryResponse } from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";
import type { UserData } from "@schemavaults/auth-common";
import captureServerException from "@/lib/captureServerException";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

const ROUTE = "/api/apps";

/** The `list_apps_query_type=authorized` branch of `GET /api/apps`. */
export async function listAuthorizedAppsForUser(
  appsRegistry: SchemaVaultsAppRegistry,
  authorizedAppsRegistry: AuthorizedAppsRegistry,
  userData: UserData,
  db: Kysely<AuthDatabase>,
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
      { status: 200 },
    );
  }

  let authorized_apps_details: SchemaVaultsApp[];
  try {
    authorized_apps_details = await Promise.all(
      user_authorized_apps.map(
        async (authorized_app: AuthorizedAppDeclaration): Promise<SchemaVaultsApp> =>
          await getDefinitionForAuthorizedDeclaration(authorized_app, appsRegistry),
      ),
    );
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "listAuthorizedAppsForUser.getDefinitionForAuthorizedDeclaration",
      route: ROUTE,
      uid: userData.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load full app definitions for apps marked as authorized",
      } satisfies ListAppsQueryResponse,
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed apps that you have authorized",
      list: authorized_apps_details,
    } satisfies ListAppsQueryResponse,
    { status: 200 },
  );
}
