import "server-only";

import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge"
/**
 * Create a new domain for an application
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>) => {
      if (environment === "development") {
        console.log("[/api/apps/domains/create] POST request received");
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
        if (!parsed.success) throw parsed.error;
        newResource = parsed.data;
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

export const dynamic = "force-dynamic"; // defaults to auto
