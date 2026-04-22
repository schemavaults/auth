import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { type AppId, appIdSchema, SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import AuthorizedAppsRegistry from "@/lib/auth-db/apps/authorized-apps-registry";
import captureServerException from "@/lib/captureServerException";

/**
 * Check whether the current user has already authorized a given app
 */
export async function GET_check_app_authorization(
  request: NextRequest,
  ctx: RouteContext<'/api/apps/[app_id]/check-authorization'>
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log("[/api/apps/[app_id]/check-authorization] GET request received");
      }

      let app_id: AppId;
      try {
        const params = await ctx.params;
        const parsed_app_id =
          await appIdSchema.safeParseAsync(
            params.app_id
          );
        if (!parsed_app_id.success) {
          throw parsed_app_id.error;
        }
        app_id = parsed_app_id.data;
      } catch (e: unknown) {
        console.error("Invalid 'app_id' to check authorization for: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Invalid 'app_id' to check authorization for",
          },
          {
            status: 400,
          },
        );
      }

      if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
        return NextResponse.json({
          success: true,
          authorized: true,
        });
      }

      try {
        const registry = new AuthorizedAppsRegistry(dbh.db);
        const authorized = await registry.isAppAuthorizedForUser(
          user.uid,
          app_id,
        );

        return NextResponse.json({
          success: true,
          authorized,
        });
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_check_app_authorization.isAppAuthorizedForUser",
          route: "/api/apps/[app_id]/check-authorization",
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to check app authorization status",
          },
          {
            status: 500,
          },
        );
      }
    },
  );
  return await protected_route(request);
}

export default GET_check_app_authorization;
