import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import loadAppForManagement from "@/lib/load-app-for-management";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]";

export type DeleteAppCallbackUrlResponse =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * DELETE /api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]
 * Remove a callback URL from an app's explicit allowlist. When the last
 * one for an environment is removed, redirect_uri validation for that
 * environment falls back to origin matching against the app's domains.
 */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/callback-urls/[app_callback_url_ref_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;
  const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
  if (!parsed_app_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid frontend app id",
      } satisfies DeleteAppCallbackUrlResponse,
      { status: 400 },
    );
  }
  const app_id: AppId = parsed_app_id.data;

  const parsed_ref_id = z.string().uuid().safeParse(params.app_callback_url_ref_id);
  if (!parsed_ref_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid callback URL reference id",
      } satisfies DeleteAppCallbackUrlResponse,
      { status: 400 },
    );
  }
  const app_callback_url_ref_id: string = parsed_ref_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "DELETE_app_callback_url",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const deleted: boolean = await appRegistry.removeAppCallbackUrl(
          app_id,
          app_callback_url_ref_id,
        );
        if (!deleted) {
          return NextResponse.json(
            {
              success: false,
              message: "No callback URL found with the given id for this app",
            } satisfies DeleteAppCallbackUrlResponse,
            { status: 404 },
          );
        }
        return NextResponse.json({
          success: true,
          message: "Callback URL removed from app",
        } satisfies DeleteAppCallbackUrlResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "DELETE_app_callback_url.removeAppCallbackUrl",
          route: ROUTE,
          uid: user.uid,
          context: { app_id, app_callback_url_ref_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to remove callback URL from app",
          } satisfies DeleteAppCallbackUrlResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
