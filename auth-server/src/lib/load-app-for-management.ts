import "server-only";

import { NextResponse } from "next/server";
import {
  isHardcodedAppId,
  type AppId,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import canUserManageApp from "@/lib/canUserManageApp";
import captureServerException from "@/lib/captureServerException";

export type LoadAppForManagementResult =
  | { ok: true; app: SchemaVaultsApp }
  | { ok: false; response: NextResponse };

export interface LoadAppForManagementOptions {
  app_id: AppId;
  user: UserData;
  dbh: ServerlessDatabase;
  /** Route path for exception capture, e.g. "/api/apps/[app_id]/client-secret". */
  route: string;
  op_name: string;
}

/**
 * Shared guard for the app-configuration management routes (client
 * secret, callback URLs): loads the app, rejects hardcoded apps, and
 * requires management access (global admin, or owner/admin of the app's
 * owner organization).
 */
export async function loadAppForManagement({
  app_id,
  user,
  dbh,
  route,
  op_name,
}: LoadAppForManagementOptions): Promise<LoadAppForManagementResult> {
  if (isHardcodedAppId(app_id)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message: "This configuration cannot be managed for hardcoded apps",
        },
        { status: 403 },
      ),
    };
  }

  let app: SchemaVaultsApp | null;
  try {
    const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
    app = await appRegistry.getApp(app_id);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: `${op_name}.getApp`,
      route,
      uid: user.uid,
      context: { app_id },
    });
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Failed to load app" },
        { status: 500 },
      ),
    };
  }

  if (!app) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "App not found" },
        { status: 404 },
      ),
    };
  }

  let authorized: boolean;
  try {
    authorized = await canUserManageApp(dbh.db, user, app);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: `${op_name}.canUserManageApp`,
      route,
      uid: user.uid,
      context: { app_id },
    });
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Failed to verify authorization" },
        { status: 500 },
      ),
    };
  }

  if (!authorized) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message:
            "You must be an admin or organization owner to manage this app's configuration",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, app };
}

export default loadAppForManagement;
