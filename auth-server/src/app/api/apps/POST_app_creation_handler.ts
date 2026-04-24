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
import isUserInOrganization from "@/lib/isUserInOrganization";
import { SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID } from "@schemavaults/auth-common";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ConflictError } from "@/lib/error/ConflictError";
import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps";

/**
 * Create a new frontend application
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
  async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
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
        "Failed to parse new SchemaVaults frontend app details from request body";
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

      if (!newResource.owner_organization_id) {
        return NextResponse.json(
          {
            success: false,
            message: "No 'owner_organization_id' was set in request body.",
          } satisfies ResourceCreationResponse,
          {
            status: 400,
          },
        );
    }

      let owner_organization_id: OrganizationID | null | undefined = newResource.owner_organization_id;

    // If owner_organization_id is specified, verify user has access
      if (owner_organization_id) {
        const role = await isUserInOrganization(
        dbh.db,
        user,
        owner_organization_id satisfies OrganizationID,
      );
        const hasAccess: boolean = user.admin || role === 'admin' || role === 'owner';
      if (!hasAccess) {
        return NextResponse.json(
          {
            success: false,
            message: "You must be a member of the organization to create apps for it",
          } satisfies ResourceCreationResponse,
          {
            status: 403,
          },
        );
      }
    } else {
      // If no owner_organization_id, only admins can create apps
      if (!user.admin) {
        return NextResponse.json(
          {
            success: false,
            message:
              "You must be an admin to create a new SchemaVaults frontend application without an organization",
          } satisfies ResourceCreationResponse,
          {
            status: 403,
          },
        );
      } else {
        // User is an admin, default to 'schemavaults' org if none set
        owner_organization_id = SCHEMAVAULTS_ORGANIZATION_ID;
      }
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
      await appRegistry.registerApp(
        newResource.app_id,
        newResource.app_name,
        newResource.app_description,
        newResource.public,
        owner_organization_id,
        newResource.web,
      );

      return NextResponse.json({
        success: true,
        message: "Successfully created new SchemaVaults frontend app",
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
        context: { app_id: newResource.app_id, owner_organization_id },
      });
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
  const response = await protected_route(request);
  return applyCorsHeadersForSchemaVaultsWeb(response, request);
}

export const dynamic = "force-dynamic"; // defaults to auto
