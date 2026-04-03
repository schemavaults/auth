import "server-only";
import type { ResourceCreationResponse } from "@/lib/auth-db/resource-creation-response";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { type AppId, appIdSchema, SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import AuthorizedAppsRegistry from "@/lib/auth-db/apps/authorized-apps-registry";

/**
 * Authorize a frontend application to receive authentication tokens on your behalf
 */
export async function POST_authorize_client_application(
  request: NextRequest,
  ctx: RouteContext<'/api/apps/[app_id]/authorize'>
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log("[/api/apps/[app_id]/authorize] POST request received");
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
        console.error("Invalid 'app_id' to authorize app for: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Invalid 'app_id' to authorize app for",
          } satisfies ResourceCreationResponse,
          {
            status: 400,
          },
        );
      }

      if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
        return NextResponse.json(
          {
            success: false,
            message: "The auth app is always authorized and cannot be explicitly authorized",
          } satisfies ResourceCreationResponse,
          {
            status: 403,
          },
        );
      }

      try {
        const registry = new AuthorizedAppsRegistry(dbh.db);
        await registry.authorizeAppForUser(
          user.uid, // user id
          app_id, // frontend app id
        );

        return NextResponse.json({
          success: true,
          message:
            "Successfully authorized frontend application to receive tokens on your behalf",
          resource_id: app_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        console.error(
          "Failed to authorize SchemaVaults frontend application: ",
          e,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Failed to authorize SchemaVaults frontend application",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }
    },
  );
  return await protected_route(request);
}

export default POST_authorize_client_application;
