import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import {
  appIdSchema,
  schemaVaultsAppCallbackUrlRefSchema,
  type AppId,
  type SchemaVaultsApp,
  type SchemaVaultsAppCallbackUrlRef,
} from "@schemavaults/app-definitions";
import { type OrganizationID } from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import type { ResourceCreationResponse } from "@/lib/auth-db";
import isUserInOrganization from "@/lib/isUserInOrganization";
import loadAppForManagement from "@/lib/load-app-for-management";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";

const ROUTE = "/api/apps/[app_id]/callback-urls";

export type ListAppCallbackUrlsResponse =
  | {
      success: true;
      message: string;
      list: readonly SchemaVaultsAppCallbackUrlRef[];
    }
  | { success: false; message: string };

/**
 * GET /api/apps/[app_id]/callback-urls
 * List the explicit callback URLs registered for an app. Visibility
 * mirrors the domains listing: public apps, org members, and admins.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/callback-urls">,
): Promise<NextResponse> {
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the app id was well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const parsed_app_id = await appIdSchema.safeParseAsync(
        (await ctx.params).app_id,
      );
      if (!parsed_app_id.success) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid frontend app id",
          } satisfies ListAppCallbackUrlsResponse,
          { status: 400 },
        );
      }
      const app_id: AppId = parsed_app_id.data;

      const appRegistry = new SchemaVaultsAppRegistry(dbh.db);

      let app: SchemaVaultsApp | null;
      try {
        app = await appRegistry.getApp(app_id);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_list_app_callback_urls.getApp",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load app with given 'app_id'",
          } satisfies ListAppCallbackUrlsResponse,
          { status: 500 },
        );
      }
      if (!app) {
        return NextResponse.json(
          {
            success: false,
            message: "App not found",
          } satisfies ListAppCallbackUrlsResponse,
          { status: 404 },
        );
      }

      if (!app.public && !user.admin) {
        let authorized: boolean = false;
        if (app.owner_organization_id) {
          const role = await isUserInOrganization(
            dbh.db,
            user,
            app.owner_organization_id as OrganizationID,
          );
          if (role === "admin" || role === "owner" || role === "member") {
            authorized = true;
          }
        }
        if (!authorized) {
          return NextResponse.json(
            {
              success: false,
              message: "You are not authorized to list callback URLs for this app",
            } satisfies ListAppCallbackUrlsResponse,
            { status: 403 },
          );
        }
      }

      try {
        const callback_urls = await appRegistry.getAppCallbackUrls(app_id);
        return NextResponse.json({
          success: true,
          message: "Callback URLs successfully listed",
          list: callback_urls,
        } satisfies ListAppCallbackUrlsResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_list_app_callback_urls.getAppCallbackUrls",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to list callback URLs for app",
          } satisfies ListAppCallbackUrlsResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

/**
 * POST /api/apps/[app_id]/callback-urls
 * Register a new explicit callback URL for an app. Once at least one
 * callback URL exists for an app + environment, OAuth2/OIDC
 * redirect_uri validation for that environment requires an exact match
 * against the registered list (instead of any path on a registered
 * domain).
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/callback-urls">,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const parsed_app_id = await appIdSchema.safeParseAsync(
        (await ctx.params).app_id,
      );
      if (!parsed_app_id.success) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid frontend app id",
          } satisfies ResourceCreationResponse,
          { status: 400 },
        );
      }
      const app_id: AppId = parsed_app_id.data;

      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "POST_create_app_callback_url",
      });
      if (!guard.ok) return guard.response;

      let newResource: SchemaVaultsAppCallbackUrlRef;
      try {
        const parsed = await schemaVaultsAppCallbackUrlRefSchema.safeParseAsync(
          await req.json(),
        );
        if (!parsed.success) {
          throw parsed.error;
        }
        newResource = parsed.data;
        if (newResource.app_id !== app_id) {
          throw new Error("App ID in body does not match App ID from route params!");
        }
      } catch (e: unknown) {
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to parse new callback URL details from request body",
          } satisfies ResourceCreationResponse,
          { status: 400 },
        );
      }

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        await appRegistry.addAppCallbackUrl(app_id, newResource);
        return NextResponse.json({
          success: true,
          message: "Successfully added callback URL to app",
          resource_id: newResource.app_callback_url_ref_id,
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
          op_name: "POST_create_app_callback_url.addAppCallbackUrl",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to add callback URL to app",
          } satisfies ResourceCreationResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
