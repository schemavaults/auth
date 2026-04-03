import {
  type ApiServerId,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type PotentiallyValidTokenSource,
  type UserData,
} from "@schemavaults/auth-common";
import type { OrganizationID } from "@schemavaults/auth-common/organizations";
import isUserInOrganization from "@/isUserInOrganization";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey/loadJwksAccessPrivateKey";
import type { IRouteGuard } from "@/route_guards/IRouteGuard";
import type { ReactElement } from "react";
import { redirectWithError } from "@/redirect-with-error";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import { RefreshTokenCookieName } from "@/RefreshTokenCookieNames";
import getSchemavaultsApiServerId from "@/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import redirectToLogin from "@/redirect-to-login";
import assertValidRouteGuardType from "@/route_guards/assertValidRouteGuardType";
import type { IBaseProtectedAuthenticatedServerComponentPageProps } from "./IBaseProtectedAuthenticatedServerComponentPageProps";
import initDefaultJwtKeyManagerForAuthenticatedRouteGuard from "./initDefaultJwtKeyManagerForAuthenticatedRouteGuard";

type RequestCookies = Awaited<
  ReturnType<typeof import("next/headers").cookies>
>;

export type TProtectedAuthenticatedPageServerComponent<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
> = (props: TProps) => Promise<ReactElement>;

type TAdditionalProps<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
> = Omit<TProps, keyof IBaseProtectedAuthenticatedServerComponentPageProps>;

export interface IWithAuthenticatedServerComponentRouteGuardAdditionalOptions<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
> {
  route_guard_type?: "authenticated" | "admin";
  jwt_keys_manager?: IJwtKeyManager;
  api_server_id?: ApiServerId;
  custom_is_authorized_check?: (props: TProps) => Promise<boolean>;
  required_organization?: OrganizationID;
}

export async function withAuthenticatedServerComponentRouteGuard<
  TProps extends IBaseProtectedAuthenticatedServerComponentPageProps =
    IBaseProtectedAuthenticatedServerComponentPageProps,
>(
  // The server component to render
  server_component: TProtectedAuthenticatedPageServerComponent<TProps>,

  // Your additional props (e.g. database handle that you want every server component to have access to)
  additional_custom_server_component_props:
    | TAdditionalProps<TProps>
    | undefined = undefined,
  opts?: IWithAuthenticatedServerComponentRouteGuardAdditionalOptions,
): Promise<ReactElement> {
  const route_guard_type: "authenticated" | "admin" =
    opts?.route_guard_type ?? "authenticated";
  assertValidRouteGuardType(route_guard_type);

  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  const [loadCookies, redirect] = await Promise.all([
    import("next/headers").then((mod) => mod.cookies),
    import("next/navigation").then((mod) => mod.redirect),
  ]);
  if (typeof loadCookies !== "function") {
    throw new TypeError("Expected 'loadCookies' to be a function");
  } else if (typeof redirect !== "function") {
    throw new TypeError("Expected 'redirect' to be a function");
  }

  const api_server_id: ApiServerId | undefined =
    opts?.api_server_id ?? getSchemavaultsApiServerId();
  try {
    if (typeof api_server_id !== "string") {
      throw new TypeError(
        "Expected result of 'getApiServerId' to be a string!",
      );
    }
  } catch (e: unknown) {
    console.error(
      "[withAuthenticatedServerComponentRouteGuard] getApiServerId() failed: ",
      e,
    );
    redirectWithError(redirect, 500, "server_misconfiguration");
  }

  const jwt_keys_manager: IJwtKeyManager =
    opts?.jwt_keys_manager ??
    initDefaultJwtKeyManagerForAuthenticatedRouteGuard();
  if (!jwt_keys_manager.isConfigured()) {
    console.error(
      "[withAuthenticatedServerComponentRouteGuard] JWT Keys Manager does not appear to be properly configured!",
    );
    redirectWithError(redirect, 500, "server_misconfiguration");
  }

  const cookies: RequestCookies = await loadCookies();
  if (!("get" in cookies) || typeof cookies.get !== "function") {
    throw new TypeError(
      "Expected 'cookies' to be a RequestCookies object with a 'get' method!",
    );
  }

  const token_sources: PotentiallyValidTokenSource[] = [];

  // Load Refresh Token for Auth Server
  if (api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
    const refresh_token_cookie = cookies.get(
      RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID),
    );
    if (typeof refresh_token_cookie?.value === "string") {
      token_sources.push({
        sourceHint: "Auth Server Refresh Token",
        type: "refresh",
        token: refresh_token_cookie.value,
      });
    }
  }

  // Load Access Token from designated cookie for current server
  const access_token_cookie_name: string = AccessTokenCookieName(api_server_id);
  const access_token_cookie = cookies.get(access_token_cookie_name);
  if (
    typeof access_token_cookie?.value === "string" &&
    access_token_cookie.value.length > 64
  ) {
    let jwt_string: string | null = null;
    try {
      const parsed = JSON.parse(access_token_cookie.value);
      if (parsed && typeof parsed.token === "string") {
        jwt_string = parsed.token;
      }
    } catch {
      // Raw JWT string fallback
      jwt_string = access_token_cookie.value;
    }
    if (jwt_string) {
      token_sources.push({
        sourceHint: `Access Token from cookie '${access_token_cookie_name satisfies string}'`,
        type: "access",
        token: jwt_string,
      });
    }
  }

  if (token_sources.length === 0) {
    redirectToLogin(redirect);
  }

  const route_guard_factory = new RouteGuardFactory({
    environment,
    is_auth_server: api_server_id === SCHEMAVAULTS_AUTH_APP_ID,
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
    redirectWithError(redirect, 403, "forbidden");
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
    };

  const final_server_component_props: TProps =
    typeof additional_custom_server_component_props === "object" &&
    additional_custom_server_component_props
      ? ({
          ...base_server_component_props,
          ...additional_custom_server_component_props,
        } as unknown as TProps)
      : (base_server_component_props as unknown as TProps);

  if (opts?.required_organization) {
    try {
      const auth_server_url = getSchemaVaultsAuthServerUri();
      const jwks_access_private_key = await loadJwksAccessPrivateKey();
      const org_role = await isUserInOrganization(
        auth_server_url,
        api_server_id,
        jwks_access_private_key,
        user.uid,
        opts.required_organization,
      );
      if (org_role === false) {
        redirectWithError(redirect, 403, "forbidden");
      }
    } catch (e: unknown) {
      console.error(
        "[withAuthenticatedServerComponentRouteGuard] Organization membership check failed: ",
        e,
      );
      redirectWithError(redirect, 500, "internal_server_error");
    }
  }

  if (typeof opts?.custom_is_authorized_check === "function") {
    let is_authorized: boolean = false;
    try {
      const custom_is_authorized_check = opts.custom_is_authorized_check;
      is_authorized = await custom_is_authorized_check(
        final_server_component_props,
      );
    } catch (e: unknown) {
      console.error("Error in 'custom_is_authorized_check' handler: ", e);
      redirectWithError(redirect, 500, "internal_server_error");
    }
    if (!is_authorized) {
      redirectWithError(redirect, 403, "forbidden");
    }
  }

  return (await ProtectedAuthenticatedPageServerComponent(
    final_server_component_props,
  )) satisfies ReactElement;
}

export default withAuthenticatedServerComponentRouteGuard;
