import "server-only";

import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
} from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

/**
 * Create a new frontend application
 */
export const POST = withAuthenticatedApiRouteGuard(
  async ({ req, user, dbh, environment }) => {
    if (environment === "development") {
      console.log("[/api/apps] POST request received");
    }

    if (!user.admin) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You must be an admin to create a new SchemaVaults frontend application",
        } satisfies ResourceCreationResponse,
        {
          status: 403,
        },
      );
    }

    let newResource: SchemaVaultsApp;
    try {
      const parsed = await schemaVaultsAppDefinitionSchema.safeParseAsync(
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
          message: "Failed to connect to apps registry",
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }

    try {
      await appRegistry.registerApp(
        newResource.app_id,
        newResource.app_name,
        newResource.app_description,
        newResource.public,
      );

      return NextResponse.json({
        success: true,
        message: "Successfully created new SchemaVaults frontend app",
        resource_id: newResource.app_id,
      } satisfies ResourceCreationResponse);
    } catch (e: unknown) {
      console.error("Failed to create SchemaVaults frontend app: ", e);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to create new SchemaVaults frontend app",
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }
  },
);

export const dynamic = "force-dynamic"; // defaults to auto
