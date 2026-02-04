import "server-only";

import {
  type ApiServerId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
  getHardcodedClientWebAppDomain,
} from "@schemavaults/app-definitions";
import type {
  OrganizationID,
  PotentiallyValidTokenSource,
  UserData,
} from "@schemavaults/auth-common";
import type { IRouteGuard } from "./IRouteGuard";
import { cookies as loadCookies } from "next/headers";
import type { ReactElement } from "react";
import { redirectWithNextAppDirError } from "@/redirect-with-error";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import { type NextRequest, NextResponse } from "next/server";
import getStringByteSize from "@/getStringByteSize";
import MaximumBrowserCookieSize from "@/MaximumBrowserCookieSize";
import RefreshTokenCookieName from "@/RefreshTokenCookieNames";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import { RemoteJwtKeyManager, type IJwtKeyManager } from "@/JwtKeyManager";
import redirectToLogin from "@/redirect-to-login";
import { redirect } from "next/navigation";
import assertValidRouteGuardType from "./assertValidRouteGuardType";

export interface IBaseProtectedAuthenticatedServerComponentPageProps {
  user: UserData;
  user_organizations: readonly OrganizationID[];
  environment: SchemaVaultsAppEnvironment;
}

export type TProtectedAuthenticatedPageServerComponent<
  TAdditionalCustomProps extends object,
> = (
  props: IBaseProtectedAuthenticatedServerComponentPageProps &
    TAdditionalCustomProps,
) => Promise<ReactElement>;

export interface IBaseProtectedAuthenticatedApiRouteInputs
  extends IBaseProtectedAuthenticatedServerComponentPageProps {
  req: NextRequest;
}

export type TProtectedAuthenticatedApiRoute<
  TAdditionalCustomRouteInputs extends object,
> = (
  route_inputs: TAdditionalCustomRouteInputs &
    IBaseProtectedAuthenticatedApiRouteInputs,
) => Promise<NextResponse>;

// default key manager is RemoteJwtKeyManager-- makes it easier for external apps, we can overwrite this once for the auth server
export function initDefaultJwtKeyManagerForAuthenticatedRouteGuard(): IJwtKeyManager {
  return new RemoteJwtKeyManager({
    auth_server_uri: getHardcodedClientWebAppDomain(
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      getAppEnvironment(),
    ),
  });
}

export async function withAuthenticatedServerComponentRouteGuard<
  TAdditionalCustomProps extends object,
>(
  server_component: TProtectedAuthenticatedPageServerComponent<TAdditionalCustomProps>,
  additional_custom_server_component_props: TAdditionalCustomProps,
  route_guard_type: "authenticated" | "admin" = "authenticated",
  custom_is_authorized_check:
    | ((
        props: IBaseProtectedAuthenticatedServerComponentPageProps &
          TAdditionalCustomProps,
      ) => Promise<boolean>)
    | undefined = undefined,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): Promise<ReactElement> {
  assertValidRouteGuardType(route_guard_type);

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
      route_guard_type,
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

  if (typeof server_component !== "function") {
    throw new TypeError(
      "Expected 'server_component' passed to withAuthenticatedServerComponentRouteGuard to be a function",
    );
  }
  const ProtectedAuthenticatedPageServerComponent = server_component;

  const base_server_component_props: IBaseProtectedAuthenticatedServerComponentPageProps =
    {
      user,
      environment,
      user_organizations: route_guard.user_organizations,
    };

  const server_component_props: IBaseProtectedAuthenticatedServerComponentPageProps &
    TAdditionalCustomProps = {
    ...base_server_component_props,
    ...additional_custom_server_component_props,
  };

  if (typeof custom_is_authorized_check === "function") {
    let is_authorized: boolean = false;
    try {
      is_authorized = await custom_is_authorized_check(server_component_props);
    } catch (e: unknown) {
      console.error("Error in 'custom_is_authorized_check' handler: ", e);
      redirectWithNextAppDirError(500, "internal_server_error");
    }
    if (!is_authorized) {
      redirectWithNextAppDirError(403, "forbidden");
    }
  }

  return (await ProtectedAuthenticatedPageServerComponent(
    server_component_props,
  )) satisfies ReactElement;
}

export function withAuthenticatedApiRouteGuard<
  TAdditionalCustomRouteInputs extends object,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TAdditionalCustomRouteInputs>,
  additional_custom_api_route_inputs: TAdditionalCustomRouteInputs,
  route_guard_type: "authenticated" | "admin" = "authenticated",
  custom_is_authorized_check:
    | ((
        route_inputs: IBaseProtectedAuthenticatedServerComponentPageProps &
          TAdditionalCustomRouteInputs,
      ) => Promise<boolean>)
    | undefined = undefined,
  jwt_keys_manager: IJwtKeyManager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard(),
  getApiServerId: () => ApiServerId = getSchemavaultsApiServerId,
): (req: NextRequest) => Promise<NextResponse> {
  assertValidRouteGuardType(route_guard_type);

  const AuthenticatedApiRoute: TProtectedAuthenticatedApiRoute<TAdditionalCustomRouteInputs> =
    api_route_handler;
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
        route_guard_type,
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

    const base_api_route_inputs: IBaseProtectedAuthenticatedApiRouteInputs = {
      req,
      user,
      environment,
      user_organizations,
    };

    const api_route_inputs: IBaseProtectedAuthenticatedApiRouteInputs &
      TAdditionalCustomRouteInputs = {
      ...base_api_route_inputs,
      ...additional_custom_api_route_inputs,
    };

    if (typeof custom_is_authorized_check === "function") {
      let is_authorized: boolean = false;
      try {
        is_authorized = await custom_is_authorized_check(api_route_inputs);
      } catch (e: unknown) {
        console.error("Error in 'custom_is_authorized_check' handler: ", e);
        return NextResponse.json(
          {
            success: false,
            error: true,
            message: "Error while checking if access is allowed",
          },
          { status: 500 },
        );
      }
      if (!is_authorized) {
        return NextResponse.json(
          {
            success: false,
            error: true,
            message: "Access is not allowed",
          },
          { status: 403 },
        );
      }
    }

    return (await AuthenticatedApiRoute(
      api_route_inputs,
    )) satisfies NextResponse;
  };
}
