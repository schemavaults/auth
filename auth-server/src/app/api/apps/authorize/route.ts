import "server-only";

import {
  AuthorizedAppsRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";

const authorizeAppEndpointRequestBodySchema = z
  .object({
    app_id: z.string().uuid(),
  })
  .required()
  .strict();

/**
 * Authorize a frontend application to receive authentication tokens on your behalf
 */
export const POST = withAuthenticatedApiRouteGuard(
  async ({ req, user, dbh, environment }) => {
    if (environment === "development") {
      console.log("[/api/apps/authorize] POST request received");
    }

    let app_id: string;
    try {
      const parsed_body =
        await authorizeAppEndpointRequestBodySchema.safeParseAsync(
          await req.json(),
        );
      if (!parsed_body.success) throw parsed_body.error;
      app_id = parsed_body.data.app_id;
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

export const dynamic = "force-dynamic"; // defaults to auto
