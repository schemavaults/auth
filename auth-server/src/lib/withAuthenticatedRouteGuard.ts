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

export interface IProtectedAuthenticatedServerComponentPageProps {
  user: UserData;
  dbh: ServerlessDatabase;
  environment: SchemaVaultsAppEnvironment;
}

export type TProtectedAuthenticatedPageServerComponent = (
  props: IProtectedAuthenticatedServerComponentPageProps,
) => Promise<ReactElement>

export interface IProtectedAuthenticatedApiRouteProps extends IProtectedAuthenticatedServerComponentPageProps {
  req: NextRequest;
}

export type TProtectedAuthenticatedApiRoute = (
  props: IProtectedAuthenticatedApiRouteProps,
) => Promise<NextResponse>

export interface IWithAuthenticatedRouteGuardUtilOpts {
  ProtectedAuthenticatedPageServerComponent: TProtectedAuthenticatedPageServerComponent;
}

export async function withAuthenticatedServerComponentRouteGuard(input: IWithAuthenticatedRouteGuardUtilOpts | TProtectedAuthenticatedPageServerComponent): Promise<ReactElement> {
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
      "authenticated",
      token_sources,
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    );

  if (!route_guard.user) {
    redirectWithError(redirect, 401, "unauthenticated");
  }
  const user: UserData = route_guard.user;

  if (!route_guard.isAccessAllowed()) {
    redirectWithError(redirect, 403, "forbidden");
  }

  const ProtectedAuthenticatedPageServerComponent = typeof input === 'function' ? input : input.ProtectedAuthenticatedPageServerComponent;
  if (typeof ProtectedAuthenticatedPageServerComponent !== 'function') {
    throw new TypeError("Expected ProtectedAuthenticatedPageServerComponent to be a function");
  }
  return (await ProtectedAuthenticatedPageServerComponent({
    user,
    dbh,
    environment
  })) satisfies ReactElement;
}

export function withAuthenticatedApiRouteGuard(input: TProtectedAuthenticatedApiRoute): (req: NextRequest) => Promise<NextResponse> {
  const AuthenticatedApiRoute: TProtectedAuthenticatedApiRoute = input;
  return async function ProtectedAuthenticatedApiRoute(req: NextRequest): Promise<NextResponse> {
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
        "authenticated",
        token_sources,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );

    if (!route_guard.user) {
      return NextResponse.json({
        success: false,
        error: true,
        message: "Authentication failed, unknown user"
      }, { status: 401 });
    }
    const user: UserData = route_guard.user;

    if (!route_guard.isAccessAllowed() || !route_guard.user) {
      return NextResponse.json({
        success: false,
        error: true,
        message: "Access is not allowed"
      }, { status: 403 })
    }

    return await AuthenticatedApiRoute({
      req,
      user,
      dbh,
      environment
    }) satisfies NextResponse;
  }
}
