import "server-only";

import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type AppId,
  appIdSchema,
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * Create a new domain for an application
 */
export async function POST_create_app_domain(
  request: NextRequest,
  ctx: RouteContext<'/api/apps/[app_id]/domains'>
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
  if (!parsed_app_id.success) {
    console.error("Failed to parse frontend app_id: ", parsed_app_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid frontend app id",
      },
      {
        status: 400,
      },
    );
  }
  const app_id: AppId = parsed_app_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>) => {
      if (environment === "development") {
        console.log(`[/api/apps/${app_id}/domains] POST request received`);
      }

      if (!user.admin) {
        return NextResponse.json(
          {
            success: false,
            message: "You must be an admin to add a domain to an application",
          } satisfies ResourceCreationResponse,
          {
            status: 403,
          },
        );
      }

      let newResource: SchemaVaultsAppDomainRef;
      try {
        const parsed = await schemaVaultsAppDomainRefSchema.safeParseAsync(
          await req.json(),
        );
        if (!parsed.success) {
          throw parsed.error;
        }
        newResource = parsed.data;
        if (newResource.app_id !== app_id) {
          throw new Error("App ID in body does not match App ID from route params!")
        }
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse new SchemaVaults frontend app details from request body";
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: errorMessage,
          } satisfies ResourceCreationResponse,
          {
            status: 400,
          },
        );
      }

      let appRegistry: SchemaVaultsAppRegistry;
      try {
        appRegistry = new SchemaVaultsAppRegistry(dbh.db);
      } catch (e: unknown) {
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to app registry",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }

      try {
        await appRegistry.addAppDomain(newResource.app_id, newResource);

        return NextResponse.json({
          success: true,
          message: "Successfully added domain to app",
          resource_id: newResource.app_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        console.error("Failed to add domain to app: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to add domain to app",
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

export default POST_create_app_domain;
