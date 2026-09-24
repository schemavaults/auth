import "server-only";

import { AuthorizedAppsRegistry, SchemaVaultsAppRegistry } from "@/lib/auth-db";
import {
  type ListAppsQueryType,
  listAppsQueryTypeSchema,
  type ListAppsQueryResponse,
} from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";
import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import type { IProtectedAuthenticatedApiRouteProps } from "@/lib/withAuthenticatedRouteGuard";
import { isUserInOrganization } from "@/lib/isUserInOrganization";
import captureServerException from "@/lib/captureServerException";
import { listAuthorizedAppsForUser } from "./list-authorized-apps-for-user";

const ROUTE = "/api/apps";

/** The query string of `GET /api/apps` as declared by the operation. */
export interface ListAppsQuery {
  readonly list_apps_query_type?: string;
  readonly organization_id?: string;
}

function respond(status: number, body: ListAppsQueryResponse): NextResponse<ListAppsQueryResponse> {
  return NextResponse.json(body, { status });
}

function failure(status: number, message: string): NextResponse<ListAppsQueryResponse> {
  return respond(status, { success: false, message });
}

/**
 * List available SchemaVaults apps. Runs behind the `listApps` operation
 * (see ./get.operation.ts); `query` is the validated query string.
 */
export async function GET_app_list_handler(
  { user, dbh, environment }: IProtectedAuthenticatedApiRouteProps,
  query: ListAppsQuery,
): Promise<NextResponse<ListAppsQueryResponse>> {
  if (environment === "development") {
    console.log("[/api/apps] GET request received");
  }

  const parsed_query_type = await listAppsQueryTypeSchema.safeParseAsync(query.list_apps_query_type);
  if (!parsed_query_type.success) {
    return failure(400, "Invalid list apps query type");
  }
  const list_apps_query_type: ListAppsQueryType = parsed_query_type.data;

  if (list_apps_query_type === "org" && query.organization_id === undefined) {
    return failure(400, "Missing 'organization_id' search param to accompany query type!");
  }
  const organization_id: string | null = query.organization_id ?? null;
  if (
    list_apps_query_type === "org" &&
    (!organization_id || !organizationIdSchema.safeParse(organization_id).success)
  ) {
    return failure(400, "Invalid 'organization_id' search param!");
  }

  let appsRegistry: SchemaVaultsAppRegistry;
  let authorizedAppsRegistry: AuthorizedAppsRegistry;
  try {
    appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
    authorizedAppsRegistry = new AuthorizedAppsRegistry(dbh.db);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_app_list_handler.loadAppsRegistry",
      route: ROUTE,
      uid: user.uid,
    });
    return failure(500, "Failed to load apps registry");
  }

  try {
    switch (list_apps_query_type) {
      case "all":
        if (!user.admin) {
          return failure(403, "You must be an admin to list all apps");
        }
        try {
          return respond(200, {
            success: true,
            message: "Successfully listed all apps",
            list: await appsRegistry.listApps("all", user),
          });
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listApps.all",
            route: ROUTE,
            uid: user.uid,
          });
          return failure(500, "Failed to list all apps");
        }

      case "public":
        try {
          return respond(200, {
            success: true,
            message: "Successfully listed all publicly-available apps",
            list: await appsRegistry.listApps("public", user),
          });
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listApps.public",
            route: ROUTE,
            uid: user.uid,
          });
          return failure(500, "Failed to list public apps");
        }

      case "authorized":
        try {
          return await listAuthorizedAppsForUser(appsRegistry, authorizedAppsRegistry, user, dbh.db);
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listAuthorizedAppsForUser",
            route: ROUTE,
            uid: user.uid,
          });
          return failure(500, "Failed to list authorized apps for user");
        }

      case "org":
        if (!organization_id) {
          throw new Error("Expected there to be a valid 'organization_id' set if this point was reached!");
        }
        if (!user.admin) {
          const role = await isUserInOrganization(dbh.db, user, organization_id as OrganizationID);
          if (role !== "admin" && role !== "owner" && role !== "member") {
            return failure(403, "You must be a member of the organization to list its apps");
          }
        }
        try {
          return respond(200, {
            success: true,
            message: "Successfully listed all apps for organization",
            list: await appsRegistry.listOrganizationApps(organization_id, user),
          });
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listOrganizationApps",
            route: ROUTE,
            uid: user.uid,
            context: { organization_id },
          });
          return failure(500, "Failed to list apps for organization");
        }

      case "owned":
        try {
          return respond(200, {
            success: true,
            message: "Successfully listed the apps owned by your account",
            list: await appsRegistry.listUserOwnedApps(user.uid),
          });
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listUserOwnedApps",
            route: ROUTE,
            uid: user.uid,
          });
          return failure(500, "Failed to list the apps owned by your account");
        }

      case "accessible":
        try {
          return respond(200, {
            success: true,
            message: "Successfully listed the apps you can access",
            list: await appsRegistry.listAppsAccessibleToUser(user),
          });
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "GET_app_list_handler.listAppsAccessibleToUser",
            route: ROUTE,
            uid: user.uid,
          });
          return failure(500, "Failed to list the apps you can access");
        }

      default:
        return failure(400, "Unsupported apps query type");
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_app_list_handler.outerCatch",
      route: ROUTE,
      uid: user.uid,
      context: { list_apps_query_type, organization_id },
    });
    return failure(500, "Failed to list apps");
  }
}
