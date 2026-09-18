import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import type { UserDocument } from "@/lib/auth-db/users";
import loadAppForManagement from "@/lib/load-app-for-management";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps/[app_id]/service-account";

/**
 * Public view of an app's service account: the machine identity that
 * `grant_type=client_credentials` tokens are minted for.
 */
export interface AppServiceAccountSummary {
  /** The service account's user id (`sub`/`uid` of its tokens). */
  uid: string;
  /** Synthetic, undeliverable address under the reserved `.invalid` TLD. */
  email: string;
  created_at: number;
  /** A disabled service account is refused the client_credentials grant. */
  disabled: boolean;
}

export type AppServiceAccountResponse =
  | {
      success: true;
      /** Null until the first client_credentials grant (or explicit creation). */
      service_account: AppServiceAccountSummary | null;
      /** Whether the app can use the grant right now (has a client secret). */
      has_client_secret: boolean;
    }
  | { success: false; message: string };

export type AppServiceAccountCreationResponse =
  | {
      success: true;
      message: string;
      service_account: AppServiceAccountSummary;
      /** False when the service account already existed. */
      created: boolean;
    }
  | { success: false; message: string };

export type AppServiceAccountDeletionResponse =
  | { success: true; message: string }
  | { success: false; message: string };

function parseAppIdParam(raw: unknown): AppId | null {
  const parsed = appIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function summarize(user: UserDocument): AppServiceAccountSummary {
  return {
    uid: user.uid,
    email: user.email,
    created_at: user.created_at,
    disabled: user.disabled ?? false,
  };
}

// Route params are parsed inside the authenticated guard so
// unauthenticated callers always get a 401 and never observe whether a
// path parameter was well-formed.

/**
 * GET /api/apps/[app_id]/service-account
 * The app's service account (if any) and whether the app is currently a
 * confidential client, i.e. eligible for the client_credentials grant.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/service-account">,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const app_id = parseAppIdParam((await ctx.params).app_id);
      if (!app_id) {
        return NextResponse.json(
          { success: false, message: "Invalid app id" } satisfies AppServiceAccountResponse,
          { status: 400 },
        );
      }

      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "GET_service_account",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const [service_account, secret] = await Promise.all([
          appRegistry.getServiceAccount(app_id),
          appRegistry.getClientSecretRecord(app_id),
        ]);
        return NextResponse.json({
          success: true,
          service_account: service_account ? summarize(service_account) : null,
          has_client_secret: secret !== null,
        } satisfies AppServiceAccountResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_service_account.getServiceAccount",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load service account",
          } satisfies AppServiceAccountResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

/**
 * POST /api/apps/[app_id]/service-account
 * Create the app's service account ahead of its first client_credentials
 * grant (so its uid can be granted permissions on resource servers up
 * front). Idempotent: an existing service account is returned with
 * `created: false`.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/service-account">,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const app_id = parseAppIdParam((await ctx.params).app_id);
      if (!app_id) {
        return NextResponse.json(
          { success: false, message: "Invalid app id" } satisfies AppServiceAccountCreationResponse,
          { status: 400 },
        );
      }

      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "POST_create_service_account",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const { user: service_account, created } =
          await appRegistry.getOrCreateServiceAccount(app_id);
        return NextResponse.json(
          {
            success: true,
            message: created
              ? "Service account created. Machine-to-machine tokens obtained with the client credentials grant are issued to it."
              : "This app already has a service account.",
            service_account: summarize(service_account),
            created,
          } satisfies AppServiceAccountCreationResponse,
          { status: created ? 201 : 200 },
        );
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "POST_create_service_account.getOrCreateServiceAccount",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to create service account",
          } satisfies AppServiceAccountCreationResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

/**
 * DELETE /api/apps/[app_id]/service-account
 * Remove the service account. Its issued-token records go with it; the
 * next client_credentials grant creates a fresh identity with a new uid.
 */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/service-account">,
): Promise<NextResponse> {
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const app_id = parseAppIdParam((await ctx.params).app_id);
      if (!app_id) {
        return NextResponse.json(
          { success: false, message: "Invalid app id" } satisfies AppServiceAccountDeletionResponse,
          { status: 400 },
        );
      }

      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "DELETE_service_account",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const deleted: boolean = await appRegistry.deleteServiceAccount(app_id);
        if (!deleted) {
          return NextResponse.json(
            {
              success: false,
              message: "This app has no service account to remove",
            } satisfies AppServiceAccountDeletionResponse,
            { status: 404 },
          );
        }
        return NextResponse.json({
          success: true,
          message:
            "Service account removed. The next client credentials grant will create a new one with a different id.",
        } satisfies AppServiceAccountDeletionResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "DELETE_service_account.deleteServiceAccount",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to remove service account",
          } satisfies AppServiceAccountDeletionResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
