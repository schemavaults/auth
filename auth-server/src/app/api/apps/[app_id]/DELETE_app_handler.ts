import "server-only";

import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import {
  type AppId,
  appIdSchema,
  isHardcodedAppId,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { isUserOwnerOfResource } from "@/lib/ownership/resource-access";

export async function DELETE_app_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]">,
): Promise<NextResponse> {
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the app id was well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      const params = await ctx.params;

      const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
      if (!parsed_app_id.success) {
        return NextResponse.json(
          { success: false, message: "Invalid app_id parameter" },
          { status: 400 },
        );
      }
      const app_id: AppId = parsed_app_id.data;

      if (isHardcodedAppId(app_id)) {
        return NextResponse.json(
          { success: false, message: "Cannot delete a hardcoded app!" },
          { status: 403 },
        );
      }

      const registry = new SchemaVaultsAppRegistry(dbh.db);

      const app = await registry.getApp(app_id);
      if (!app) {
        return NextResponse.json(
          { success: false, message: "App not found" },
          { status: 404 },
        );
      }

      // Organization owners, the owning user of a user-owned app, or global
      // admins may delete an app (platform-owned apps: admins only).
      const isOwner: boolean = await isUserOwnerOfResource(dbh.db, user, app);
      if (!isOwner) {
        return NextResponse.json(
          { success: false, message: "Only the app's owner (organization owners, the owning user, or global admins) can delete apps" },
          { status: 403 },
        );
      }

      const result = await registry.deleteApp(app_id);
      if (!result.success) {
        return NextResponse.json(
          { success: false, message: result.message },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { success: true, message: result.message },
        { status: 200 },
      );
    },
  );

  return await protected_route(req);
}

export default DELETE_app_handler;
