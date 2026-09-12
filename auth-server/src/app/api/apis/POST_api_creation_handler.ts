import "server-only";

import {
  SchemaVaultsApiServerRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import { resolveRequestedOwnershipForCreation } from "@/lib/ownership/requested-ownership";
import type { ResourceOwnership } from "@schemavaults/app-definitions";
import { ConflictError } from "@/lib/error/ConflictError";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis";

/**
 * Create a new API server
 */
export default async function POST_api_creation_handler(request: NextRequest): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, redis, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log("[/api/apis] POST request received");
      }

      let newResource: SchemaVaultsApiServerDefinition;
      try {
        const parsed =
          await schemaVaultsApiServerDefinitionSchema.refine(function noHardcodedApiServers(values) {
            return typeof values.hardcoded === 'boolean' && !values.hardcoded
          }, "Hardcoded API server definitions may not be dynamically created at this endpoint.").safeParseAsync(
            await req.json(),
          );
        if (!parsed.success) throw parsed.error;
        newResource = parsed.data;
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse new API server details from request body";
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

      // Who will own the new API server (platform / organization / user),
      // and is the caller allowed to create API servers for that owner?
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
          op_name: "POST_api_creation_handler.resolveRequestedOwnership",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id: newResource.api_server_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to resolve who should own the new API server",
          } satisfies ResourceCreationResponse,
          { status: 500 },
        );
      }

      let apiServerRegistry: SchemaVaultsApiServerRegistry;
      try {
        apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "POST_api_creation_handler.loadApiServersRegistry",
          route: ROUTE,
          uid: user.uid,
        });
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
        await apiServerRegistry.registerApiServer({
          api_server_id: newResource.api_server_id,
          api_server_name: newResource.api_server_name,
          api_server_description: newResource.api_server_description,
          publicly_listed: newResource.public satisfies boolean,
          ownership,
          created_by: user.uid,
        });

        return NextResponse.json({
          success: true,
          message: "Successfully created new API server",
          resource_id: newResource.api_server_id,
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
          op_name: "POST_api_creation_handler.registerApiServer",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id: newResource.api_server_id, ownership },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to create new API server",
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
