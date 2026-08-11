import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import {
  generateClientSecret,
  hashClientSecret,
} from "@/lib/oauth2/client-secret";
import loadAppForManagement from "@/lib/load-app-for-management";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps/[app_id]/client-secret";

export type ClientSecretMetadataResponse =
  | {
      success: true;
      /** Whether the app currently has a client secret (is confidential). */
      has_client_secret: boolean;
      /** First-generation time (ms since epoch); absent without a secret. */
      created_at?: number;
      /** Last generation/rotation time (ms); absent without a secret. */
      updated_at?: number;
    }
  | { success: false; message: string };

export type ClientSecretGenerationResponse =
  | {
      success: true;
      message: string;
      /** The plaintext client secret — shown once, never retrievable again. */
      client_secret: string;
    }
  | { success: false; message: string };

export type ClientSecretDeletionResponse =
  | { success: true; message: string }
  | { success: false; message: string };

function parseAppIdParam(raw: unknown): AppId | null {
  const parsed = appIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * GET /api/apps/[app_id]/client-secret
 * Metadata only — the secret itself is never retrievable after generation.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/client-secret">,
): Promise<NextResponse> {
  const params = await ctx.params;
  const app_id = parseAppIdParam(params.app_id);
  if (!app_id) {
    return NextResponse.json(
      { success: false, message: "Invalid app id" } satisfies ClientSecretMetadataResponse,
      { status: 400 },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "GET_client_secret_metadata",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const record = await appRegistry.getClientSecretRecord(app_id);
        if (!record) {
          return NextResponse.json({
            success: true,
            has_client_secret: false,
          } satisfies ClientSecretMetadataResponse);
        }
        return NextResponse.json({
          success: true,
          has_client_secret: true,
          created_at: record.created_at,
          updated_at: record.updated_at,
        } satisfies ClientSecretMetadataResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_client_secret_metadata.getClientSecretRecord",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load client secret metadata",
          } satisfies ClientSecretMetadataResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

async function generateAndStoreSecret(
  props: IProtectedAuthenticatedApiRouteProps,
  app_id: AppId,
  mode: "create" | "rotate",
): Promise<NextResponse> {
  const { user, dbh } = props;
  const op_name =
    mode === "create" ? "POST_generate_client_secret" : "PUT_rotate_client_secret";

  const guard = await loadAppForManagement({
    app_id,
    user,
    dbh,
    route: ROUTE,
    op_name,
  });
  if (!guard.ok) return guard.response;

  try {
    const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
    const existing = await appRegistry.getClientSecretRecord(app_id);
    if (mode === "create" && existing) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This app already has a client secret. Use rotation to replace it.",
        } satisfies ClientSecretGenerationResponse,
        { status: 409 },
      );
    }

    const client_secret: string = generateClientSecret();
    await appRegistry.setClientSecret(
      app_id,
      hashClientSecret(client_secret),
      user.uid,
    );

    const message: string =
      mode === "create"
        ? "Client secret generated successfully. Save it securely - it will not be shown again."
        : "Client secret rotated successfully. The previous secret no longer works. Save the new secret securely - it will not be shown again.";
    return NextResponse.json({
      success: true,
      message,
      client_secret,
    } satisfies ClientSecretGenerationResponse);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: `${op_name}.setClientSecret`,
      route: ROUTE,
      uid: user.uid,
      context: { app_id },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate client secret",
      } satisfies ClientSecretGenerationResponse,
      { status: 500 },
    );
  }
}

/**
 * POST /api/apps/[app_id]/client-secret
 * Generate a client secret for an app that has none (409 otherwise),
 * making the app a confidential OAuth2/OIDC client. Returns the
 * plaintext secret exactly once.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/client-secret">,
): Promise<NextResponse> {
  const params = await ctx.params;
  const app_id = parseAppIdParam(params.app_id);
  if (!app_id) {
    return NextResponse.json(
      { success: false, message: "Invalid app id" } satisfies ClientSecretGenerationResponse,
      { status: 400 },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async (props: IProtectedAuthenticatedApiRouteProps) =>
      generateAndStoreSecret(props, app_id, "create"),
  );
  return await protected_route(req);
}

/**
 * PUT /api/apps/[app_id]/client-secret
 * Rotate (or create) the client secret on demand. The previous secret is
 * invalidated immediately. Returns the new plaintext secret exactly once.
 */
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/client-secret">,
): Promise<NextResponse> {
  const params = await ctx.params;
  const app_id = parseAppIdParam(params.app_id);
  if (!app_id) {
    return NextResponse.json(
      { success: false, message: "Invalid app id" } satisfies ClientSecretGenerationResponse,
      { status: 400 },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async (props: IProtectedAuthenticatedApiRouteProps) =>
      generateAndStoreSecret(props, app_id, "rotate"),
  );
  return await protected_route(req);
}

/**
 * DELETE /api/apps/[app_id]/client-secret
 * Remove the client secret, reverting the app to a public client.
 */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]/client-secret">,
): Promise<NextResponse> {
  const params = await ctx.params;
  const app_id = parseAppIdParam(params.app_id);
  if (!app_id) {
    return NextResponse.json(
      { success: false, message: "Invalid app id" } satisfies ClientSecretDeletionResponse,
      { status: 400 },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ user, dbh }: IProtectedAuthenticatedApiRouteProps) => {
      const guard = await loadAppForManagement({
        app_id,
        user,
        dbh,
        route: ROUTE,
        op_name: "DELETE_client_secret",
      });
      if (!guard.ok) return guard.response;

      try {
        const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const deleted: boolean = await appRegistry.deleteClientSecret(app_id);
        if (!deleted) {
          return NextResponse.json(
            {
              success: false,
              message: "This app has no client secret to remove",
            } satisfies ClientSecretDeletionResponse,
            { status: 404 },
          );
        }
        return NextResponse.json({
          success: true,
          message:
            "Client secret removed. This app is now a public client again.",
        } satisfies ClientSecretDeletionResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "DELETE_client_secret.deleteClientSecret",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to remove client secret",
          } satisfies ClientSecretDeletionResponse,
          { status: 500 },
        );
      }
    },
  );
  return await protected_route(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
