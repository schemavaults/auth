import "server-only";

import { SchemaVaultsAppRegistry, ServerlessDatabase } from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth-common";
import {
  type SchemaVaultsApp,
  type SchemaVaultsAppDomainRef,
  type SchemaVaultsAppEnvironment,
  appIdSchema,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

export type ListAppDomainsResponse =
  | {
      success: true;
      message: string;
      list: SchemaVaultsAppDomainRef[];
    }
  | {
      success: false;
      message: string;
    };

/**
 * List available domains for a SchemaVaults app
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  input: { params: Promise<{ app_id: string }> },
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const parsed_app_id = await appIdSchema.safeParseAsync(
    (await input.params).app_id,
  );
  if (!parsed_app_id.success) {
    console.error("Failed to parse frontend app_id: ", parsed_app_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid frontend app id, not a string",
      } satisfies ListAppDomainsResponse,
      {
        status: 400,
      },
    );
  }
  const app_id: string = parsed_app_id.data;

  if (environment === "development") {
    console.log(`[/api/apps/domains/${app_id}/list] Received POST request`);
  }

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard =
      await RouteGuardFactory.getInstance().createGuardFromAuthHeader(
        "admin",
        req.headers.get("Authorization") ??
          req.headers.get("authorization") ??
          null,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );
    const user: UserData | null = route_guard.user;
    if (!route_guard.isAccessAllowed()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your access token does not grant you access to this resource",
        } satisfies ListAppDomainsResponse,
        {
          status: 403,
        },
      );
    }
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to load user from authorization token",
        } satisfies ListAppDomainsResponse,
        {
          status: 401,
        },
      );
    }
    userData = user;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message:
          "You must pass a valid access token in the Authorization header to use this resource",
      } satisfies ListAppDomainsResponse,
      {
        status: 403,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let apps: SchemaVaultsAppRegistry;
  try {
    apps = new SchemaVaultsAppRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to apps registry",
      } satisfies ListAppDomainsResponse,
      {
        status: 500,
      },
    );
  }

  let app: SchemaVaultsApp;
  try {
    const loadAppQuery = await apps.getApp(app_id);
    if (!loadAppQuery) {
      throw new Error(`No app found with app_id ${app_id}`);
    }
    app = loadAppQuery;
  } catch (e: unknown) {
    console.error("Failed to load SchemaVaults app with given 'app_id': ", e)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to load SchemaVaults app with given 'app_id'",
      } satisfies ListAppDomainsResponse,
      {
        status: 404,
      },
    );
  }

  if (!app.public && !userData.admin) {
    console.error("Non-public apps are currently reserved for admins!");
    return NextResponse.json(
      {
        success: false,
        message: "You are not authorized to list domains for this app",
      } satisfies ListAppDomainsResponse,
      {
        status: 403,
      },
    );
  }

  try {
    const domains = await apps.getAppDomains(app_id);
    return NextResponse.json({
      success: true,
      message: "Domains successfully listed",
      list: domains,
    } satisfies ListAppDomainsResponse);
  } catch (e: unknown) {
    console.error("Failed to list domains for SchemaVaults app: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list domains for SchemaVaults app",
      } satisfies ListAppDomainsResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
