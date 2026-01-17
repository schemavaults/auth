import "server-only";

import { SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment, getAppEnvironment } from "@schemavaults/app-definitions";
import type {
  PotentiallyValidTokenSource,
  UserData,
} from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { cookies as loadCookies } from "next/headers";
import type { ReactElement } from "react";
import redirectWithError from "@/lib/redirect-with-error";
import { redirect } from "next/navigation";
import RouteGuardFactory from "@/lib/RouteGuardFactory";
import { ServerlessDatabase } from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import getStringByteSize from "./getStringByteSize";
import MaximumBrowserCookieSize from "./MaximumBrowserCookieSize";
import RefreshTokenCookieName from "./RefreshTokenCookieNames";

export interface IProtectedAdminServerComponentPageProps {
  user: UserData;
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
}

export type TProtectedAdminPageServerComponent = (
  props: IProtectedAdminServerComponentPageProps,
) => Promise<ReactElement>

export interface IProtectedAdminApiRouteProps extends IProtectedAdminServerComponentPageProps {
  req: NextRequest;
}

export type TProtectedAdminApiRoute = (
  props: IProtectedAdminApiRouteProps,
) => Promise<NextResponse>

export interface IWithAdminRouteGuardUtilOpts {
  ProtectedAdminPageServerComponent: TProtectedAdminPageServerComponent;
}

export async function withAdminServerComponentRouteGuard(input: IWithAdminRouteGuardUtilOpts | TProtectedAdminPageServerComponent): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment()

  const cookies = await loadCookies();
  await using dbh = ServerlessDatabase.createDBH();

  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = cookies.get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  const route_guard_factory = new RouteGuardFactory(dbh.db);
  const route_guard: IRouteGuard =
    await route_guard_factory.createGuardFromTokenSources(
      "admin",
      token_sources,
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    );

  if (!route_guard.user) {
    redirectWithError(redirect, 401, "unauthenticated");
  }
  const user: UserData = route_guard.user;

  if (!route_guard.isAccessAllowed() || !user.admin) {
    redirectWithError(redirect, 403, "forbidden");
  }

  const ProtectedAdminPageServerComponent = typeof input === 'function' ? input : input.ProtectedAdminPageServerComponent;
  if (typeof ProtectedAdminPageServerComponent !== 'function') {
    throw new TypeError("Expected ProtectedAdminPageServerComponent to be a function");
  }
  return (await ProtectedAdminPageServerComponent({
    user,
    dbh,
    environment
  })) satisfies ReactElement;
}

export function withAdminApiRouteGuard(input: TProtectedAdminApiRoute): (req: NextRequest) => Promise<NextResponse> {
  const AdminApiRoute: TProtectedAdminApiRoute = input;
  return async function ProtectedAdminApiRoute(req: NextRequest): Promise<NextResponse> {
    const environment: SchemaVaultsAppEnvironment = getAppEnvironment()
    await using dbh = ServerlessDatabase.createDBH();

    const token_sources: PotentiallyValidTokenSource[] = [];

    const refresh_token_cookie = req.cookies.get(RefreshTokenCookieName);
    if (
      typeof refresh_token_cookie?.value === "string" &&
      refresh_token_cookie.value.length > 64 &&
      getStringByteSize(refresh_token_cookie.value) <= MaximumBrowserCookieSize
    ) {
      token_sources.push({
        sourceHint: "Auth Server Refresh Token",
        type: "refresh",
        token: refresh_token_cookie.value satisfies string,
      });
    }

    if (req.headers.has(RefreshTokenCookieName)) {
      const auth_header: string | null = req.headers.get("Authorization");
      if (!auth_header || typeof auth_header !== 'string') {
        throw new Error("Expected 'Authorization' to be non-empty string if set.")
      }
      if (!auth_header.startsWith("Bearer ")) {
        throw new Error("Expected header 'Authorization' to start with 'Bearer '");
      }
      const refresh_token_from_header: string =
        typeof auth_header === "string" && auth_header.startsWith("Bearer ")
          ? auth_header.slice("Bearer ".length)
          : "";
      if (!refresh_token_from_header) {
        throw new Error(`Refresh token cookie from header 'Authorization' appears to be empty!`)
      }
      token_sources.push({
        sourceHint: "Auth Server Access Token",
        type: "access",
        token: refresh_token_from_header satisfies string,
      });
    }

    const route_guard_factory = new RouteGuardFactory(dbh.db);
    const route_guard: IRouteGuard =
      await route_guard_factory.createGuardFromTokenSources(
        "admin",
        token_sources,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );

    if (!route_guard.user) {
      return NextResponse.json({
        success: false,
        error: true,
        message: "Authentication failed, unknown user"
      }, { status: 401})
    }
    const user: UserData = route_guard.user;

    if (!route_guard.isAccessAllowed() || !route_guard.user.admin) {
      return NextResponse.json({
        success: false,
        error: true,
        message: "Access is not allowed"
      }, { status: 403 })
    }

    return await AdminApiRoute({
      req,
      user,
      dbh,
      environment
    }) satisfies NextResponse;
  }
}
