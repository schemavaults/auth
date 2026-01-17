import "server-only";

import {
  SchemaVaultsApiServerRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
} from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

/**
 * Create a new API server
 */
const POST_api_creation_handler = withAuthenticatedApiRouteGuard(
  async ({ req, user, dbh, environment }) => {
    if (environment === "development") {
      console.log("[/api/apis] POST request received");
    }

    if (!user.admin) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You must be an admin to create a new SchemaVaults API server",
        } satisfies ResourceCreationResponse,
        {
          status: 403,
        },
      );
    }

    let newResource: SchemaVaultsApiServerDefinition;
    try {
      const parsed =
        await schemaVaultsApiServerDefinitionSchema.safeParseAsync(
          await req.json(),
        );
      if (!parsed.success) throw parsed.error;
      newResource = parsed.data;
    } catch (e: unknown) {
      const errorMessage =
        "Failed to parse new SchemaVaults API server details from request body";
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

    let apiServerRegistry: SchemaVaultsApiServerRegistry;
    try {
      apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
    } catch (e: unknown) {
      console.error(e);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to connect to API servers registry",
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }

    try {
      await apiServerRegistry.registerApiServer(
        newResource.api_server_id,
        newResource.api_server_name,
        newResource.api_server_description,
        newResource.public,
      );

      return NextResponse.json({
        success: true,
        message: "Successfully created new SchemaVaults API server",
        resource_id: newResource.api_server_id,
      } satisfies ResourceCreationResponse);
    } catch (e: unknown) {
      console.error("Failed to create SchemaVaults API server: ", e);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to create new SchemaVaults API server",
        } satisfies ResourceCreationResponse,
        {
          status: 500,
        },
      );
    }
  },
);

export default POST_api_creation_handler;
