import "server-only";
import type { ResourceCreationResponse } from "@/lib/auth-db/resource-creation-response";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { type AppId, appIdSchema, SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import AuthorizedAppsRegistry from "@/lib/auth-db/apps/authorized-apps-registry";
import { z } from "zod";
import { oauth2StateSchema } from "@schemavaults/auth-common";
import captureServerException from "@/lib/captureServerException";

// Optional OAuth2 `state` parameter (RFC 6749 §10.12). Accepted on the
// consent POST so clients can declare the nonce they generated — it is
// not persisted here (the browser round-trips state through the
// authorize URL → callback URL path on its own). Parsing it lets the
// server reject malformed values early and log the CSRF nonce length
// in development for debugging mismatches.
const authorizeRequestBodySchema = z
  .object({
    state: oauth2StateSchema.optional(),
  })
  .strict();

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

      if (app_id === SCHEMAVAULTS_AUTH_APP_ID) {
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

      // Parse (optional) OAuth2 `state` from the body. A missing body or
      // an empty body is fine — older clients simply won't send it.
      let parsedState: string | undefined = undefined;
      try {
        const text = await request.text();
        if (text && text.length > 0) {
          const parsed = authorizeRequestBodySchema.safeParse(JSON.parse(text));
          if (!parsed.success) {
            return NextResponse.json(
              {
                success: false,
                message: "Invalid request body",
              } satisfies ResourceCreationResponse,
              { status: 400 },
            );
          }
          parsedState = parsed.data.state;
        }
      } catch (e: unknown) {
        console.error("Failed to parse authorize request body: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to parse request body",
          } satisfies ResourceCreationResponse,
          { status: 400 },
        );
      }

      if (environment === "development" && typeof parsedState === "string") {
        console.log(
          `[/api/apps/${app_id}/authorize] Received OAuth2 state (length=${parsedState.length}); will be echoed on callback by the browser, not persisted server-side.`,
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
        await captureServerException(dbh.db, e, {
          op_name: "POST_authorize_client_application.authorizeAppForUser",
          route: "/api/apps/[app_id]/authorize",
          uid: user.uid,
          context: { app_id },
        });
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
