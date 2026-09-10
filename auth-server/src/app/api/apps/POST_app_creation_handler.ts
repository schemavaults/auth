import "server-only";

import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { resolveRequestedOwnershipForCreation } from "@/lib/ownership/requested-ownership";
import type { ResourceOwnership } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ConflictError } from "@/lib/error/ConflictError";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps";

/**
 * Create a new frontend application
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
  async ({ req, user, dbh, redis, environment }: IProtectedAuthenticatedApiRouteProps) => {
    if (environment === "development") {
      console.log("[/api/apps] POST request received");
    }
    const debug: boolean = shouldEnableDebug(environment);

    let newResource: SchemaVaultsApp;
    try {
      const parsed = await schemaVaultsAppDefinitionSchema.refine(function noHardcodedApps(values) {
        return typeof values.hardcoded === 'boolean' && !values.hardcoded;
      }, "Hardcoded apps are not allowed to be dynamically created.").safeParseAsync(
        await req.json(),
      );
      if (!parsed.success) {
        throw parsed.error;
      }
      newResource = parsed.data;
    } catch (e: unknown) {
      const genericBadRequestErrMsg: string =
        "Failed to parse new frontend app details from request body";
      console.error(`${genericBadRequestErrMsg}: `, e);
      return NextResponse.json(
        {
          success: false,
          message: genericBadRequestErrMsg,
        } satisfies ResourceCreationResponse,
        {
          status: 400,
        },
      );
    }

    // Who will own the new app (platform / organization / user), and is the
    // caller allowed to create apps for that owner?
    let ownership: ResourceOwnership;
    try {
      const resolved = await resolveRequestedOwnershipForCreation(
        dbh.db,
        user,
        newResource,
        redis.client,
      );
      if (!resolved.ok) {
        return NextResponse.json(
          {
            success: false,
            message: resolved.message,
          } satisfies ResourceCreationResponse,
          { status: resolved.status },
        );
      }
      ownership = resolved.ownership;
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "POST_app_creation_handler.resolveRequestedOwnership",
        route: ROUTE,
        uid: user.uid,
        context: { app_id: newResource.app_id },
      });
      return NextResponse.json(
        {
          success: false,
          message: "Failed to resolve who should own the new app",
        } satisfies ResourceCreationResponse,
        { status: 500 },
      );
    }

    let appRegistry: SchemaVaultsAppRegistry;
    try {
      appRegistry = new SchemaVaultsAppRegistry(dbh.db);
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "POST_app_creation_handler.loadAppsRegistry",
        route: ROUTE,
        uid: user.uid,
      });
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

    if (typeof newResource.web !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          message: "The 'web' field must be a boolean",
        } satisfies ResourceCreationResponse,
        { status: 400 },
      );
    }

    try {
      if (debug) {
        console.log("[POST /api/apps] Attempting to register new app: ", newResource)
      }
      await appRegistry.registerApp({
        app_id: newResource.app_id,
        app_name: newResource.app_name,
        app_description: newResource.app_description,
        publicly_listed: newResource.public,
        ownership,
        web: newResource.web,
        created_by: user.uid,
      });

      return NextResponse.json({
        success: true,
        message: "Successfully created new frontend app",
        resource_id: newResource.app_id,
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
        op_name: "POST_app_creation_handler.registerApp",
        route: ROUTE,
        uid: user.uid,
        context: { app_id: newResource.app_id, ownership },
      });
      return NextResponse.json(
        {
          success: false,
          message: "Failed to create new frontend app",
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
