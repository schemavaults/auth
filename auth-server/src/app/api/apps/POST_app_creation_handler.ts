import "server-only";

import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import { NextResponse } from "next/server";
import type { IProtectedAuthenticatedApiRouteProps } from "@/lib/withAuthenticatedRouteGuard";
import { resolveRequestedOwnershipForCreation } from "@/lib/ownership/requested-ownership";
import type { ResourceOwnership } from "@schemavaults/app-definitions";
import shouldEnableDebug from "@/lib/should-enable-debug";
import { ConflictError } from "@/lib/error/ConflictError";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps";

function respond(status: number, body: ResourceCreationResponse): NextResponse<ResourceCreationResponse> {
  return NextResponse.json(body, { status });
}

/**
 * Create a new frontend application. Runs behind the `createApp` operation
 * (see ./post.operation.ts); `newResource` is the validated JSON body.
 */
export async function POST_app_creation_handler(
  { user, dbh, redis, environment }: IProtectedAuthenticatedApiRouteProps,
  newResource: SchemaVaultsApp,
): Promise<NextResponse<ResourceCreationResponse>> {
  if (environment === "development") {
    console.log("[/api/apps] POST request received");
  }
  const debug: boolean = shouldEnableDebug(environment);

  // Hardcoded apps are not allowed to be dynamically created: refused with
  // the same 400 the body parser produced before the operation runtime
  // took over body validation.
  if (typeof newResource.hardcoded !== "boolean" || newResource.hardcoded) {
    const genericBadRequestErrMsg: string = "Failed to parse new frontend app details from request body";
    console.error(`${genericBadRequestErrMsg}: `, "Hardcoded apps are not allowed to be dynamically created.");
    return respond(400, { success: false, message: genericBadRequestErrMsg });
  }

  // Who will own the new app (platform / organization / user), and is the
  // caller allowed to create apps for that owner?
  let ownership: ResourceOwnership;
  try {
    const resolved = await resolveRequestedOwnershipForCreation(dbh.db, user, newResource, redis.client);
    if (!resolved.ok) {
      return respond(resolved.status, { success: false, message: resolved.message });
    }
    ownership = resolved.ownership;
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "POST_app_creation_handler.resolveRequestedOwnership",
      route: ROUTE,
      uid: user.uid,
      context: { app_id: newResource.app_id },
    });
    return respond(500, { success: false, message: "Failed to resolve who should own the new app" });
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
    return respond(500, { success: false, message: "Failed to connect to apps registry" });
  }

  if (typeof newResource.web !== "boolean") {
    return respond(400, { success: false, message: "The 'web' field must be a boolean" });
  }

  try {
    if (debug) {
      console.log("[POST /api/apps] Attempting to register new app: ", newResource);
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

    return respond(200, {
      success: true,
      message: "Successfully created new frontend app",
      resource_id: newResource.app_id,
    });
  } catch (e: unknown) {
    if (e instanceof ConflictError) {
      return respond(409, { success: false, message: e.message });
    }
    await captureServerException(dbh.db, e, {
      op_name: "POST_app_creation_handler.registerApp",
      route: ROUTE,
      uid: user.uid,
      context: { app_id: newResource.app_id, ownership },
    });
    return respond(500, { success: false, message: "Failed to create new frontend app" });
  }
}
