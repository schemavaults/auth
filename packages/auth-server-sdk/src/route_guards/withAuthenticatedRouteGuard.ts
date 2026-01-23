import "server-only";

import {
  ApiServerId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import type {
  OrganizationID,
  PotentiallyValidTokenSource,
  UserData,
} from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk/route_guards";
import { cookies as loadCookies } from "next/headers";
import type { ReactElement } from "react";
import { redirectWithNextAppDirError } from "@/redirect-with-error";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import { type NextRequest, NextResponse } from "next/server";
import getStringByteSize from "@/getStringByteSize";
import MaximumBrowserCookieSize from "@/MaximumBrowserCookieSize";
import RefreshTokenCookieName from "@/RefreshTokenCookieNames";
import type { SchemaVaultsPostgresNeonProxyAdapter } from "@schemavaults/dbh";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import redirectToLogin from "@/redirect-to-login";
import { redirect } from "next/navigation";

interface Dbh<Db extends object>
  extends AsyncDisposable,
    SchemaVaultsPostgresNeonProxyAdapter<Db> {}

export interface IProtectedAuthenticatedServerComponentPageProps<
  Db extends object,
> {
  user: UserData;
  user_organizations: readonly OrganizationID[];
  dbh: Dbh<Db>;
  environment: SchemaVaultsAppEnvironment;
}

export type TProtectedAuthenticatedPageServerComponent<Db extends object> = (
  props: IProtectedAuthenticatedServerComponentPageProps<Db>,
) => Promise<ReactElement>;

export interface IProtectedAuthenticatedApiRouteProps<Db extends object>
  extends IProtectedAuthenticatedServerComponentPageProps<Db> {
  req: NextRequest;
}

export type TProtectedAuthenticatedApiRoute<Db extends object> = (
  props: IProtectedAuthenticatedApiRouteProps<Db>,
) => Promise<NextResponse>;

export interface IWithAuthenticatedRouteGuardUtilOpts<Db extends object> {
  ProtectedAuthenticatedPageServerComponent: TProtectedAuthenticatedPageServerComponent<Db>;
}

export async function withAuthenticatedServerComponentRouteGuard<
  Db extends object,
>(
  input:
    | IWithAuthenticatedRouteGuardUtilOpts<Db>
    | TProtectedAuthenticatedPageServerComponent<Db>,
  dbh: Dbh<Db>,
  jwt_keys_manager: IJwtKeyManager,
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const api_server_id: ApiServerId = getApiServerId();
  const cookies = await loadCookies();

  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = cookies.get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  if (token_sources.length === 0) {
    redirectToLogin(redirect);
  }

  const route_guard_factory = new RouteGuardFactory({
    environment,
    is_auth_server: api_server_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    jwt_keys_manager,
  });
  const route_guard: IRouteGuard =
    await route_guard_factory.createGuardFromTokenSources(
      "authenticated",
      token_sources,
      api_server_id,
    );

  if (!route_guard.user) {
    redirectToLogin(redirect);
  }
  const user: UserData = route_guard.user;

  if (!route_guard.isAccessAllowed()) {
    redirectWithNextAppDirError(403, "forbidden");
  }

  const ProtectedAuthenticatedPageServerComponent =
    typeof input === "function"
      ? input
      : input.ProtectedAuthenticatedPageServerComponent;
  if (typeof ProtectedAuthenticatedPageServerComponent !== "function") {
    throw new TypeError(
      "Expected ProtectedAuthenticatedPageServerComponent to be a function",
    );
  }
  return (await ProtectedAuthenticatedPageServerComponent({
    user,
    dbh,
    environment,
    user_organizations: route_guard.user_organizations,
  })) satisfies ReactElement;
}

export function withAuthenticatedApiRouteGuard<Db extends object>(
  input: TProtectedAuthenticatedApiRoute<Db>,
  dbh: Dbh<Db>,
  jwt_keys_manager: IJwtKeyManager,
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): (req: NextRequest) => Promise<NextResponse> {
  const AuthenticatedApiRoute: TProtectedAuthenticatedApiRoute<Db> = input;
  return async function ProtectedAuthenticatedApiRoute(
    req: NextRequest,
  ): Promise<NextResponse> {
    const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
    const api_server_id: ApiServerId = getApiServerId();

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
      if (!auth_header || typeof auth_header !== "string") {
        throw new Error(
          "Expected 'Authorization' to be non-empty string if set.",
        );
      }
      if (!auth_header.startsWith("Bearer ")) {
        throw new Error(
          "Expected header 'Authorization' to start with 'Bearer '",
        );
      }
      const refresh_token_from_header: string =
        typeof auth_header === "string" && auth_header.startsWith("Bearer ")
          ? auth_header.slice("Bearer ".length)
          : "";
      if (!refresh_token_from_header) {
        throw new Error(
          `Refresh token cookie from header 'Authorization' appears to be empty!`,
        );
      }
      token_sources.push({
        sourceHint: "Auth Server Access Token",
        type: "access",
        token: refresh_token_from_header satisfies string,
      });
    }

    const route_guard_factory = new RouteGuardFactory({
      environment,
      is_auth_server: api_server_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      jwt_keys_manager,
    });
    const route_guard: IRouteGuard =
      await route_guard_factory.createGuardFromTokenSources(
        "authenticated",
        token_sources,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );

    if (!route_guard.user) {
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: "Authentication failed, unknown user",
        },
        { status: 401 },
      );
    }
    const user: UserData = route_guard.user;

    if (!Array.isArray(route_guard.user_organizations)) {
      return NextResponse.json(
        {
          success: false,
          error: true,
          message:
            "Authentication failed, failed to load associated user organizations",
        },
        { status: 401 },
      );
    }

    if (!route_guard.isAccessAllowed() || !route_guard.user) {
      return NextResponse.json(
        {
          success: false,
          error: true,
          message: "Access is not allowed",
        },
        { status: 403 },
      );
    }

    const user_organizations: readonly OrganizationID[] =
      route_guard.user_organizations;

    return (await AuthenticatedApiRoute({
      req,
      user,
      dbh,
      environment,
      user_organizations,
    })) satisfies NextResponse;
  };
}
