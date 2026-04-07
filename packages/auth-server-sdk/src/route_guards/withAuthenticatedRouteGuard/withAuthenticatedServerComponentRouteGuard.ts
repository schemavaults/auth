import {
  type ApiServerId,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
  apiServerIdSchema,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  organizationIdSchema,
  userDataSchema,
  type PotentiallyValidTokenSource,
  type UserData,
} from "@schemavaults/auth-common";
import type {
  OrganizationID,
  OrganizationMembershipRoleType,
} from "@schemavaults/auth-common/organizations";
import isUserInOrganizationFromAuthServer from "@/isUserInOrganization";
import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey/loadJwksAccessPrivateKey";
import type { IRouteGuard } from "@/route_guards/IRouteGuard";
import type { ReactElement } from "react";
import { redirectWithError } from "@/redirect-with-error";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import { RefreshTokenCookieName } from "@/RefreshTokenCookieNames";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
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
  custom_is_user_in_organization?: (
    user: UserData,
    org_id: OrganizationID,
  ) => Promise<OrganizationMembershipRoleType | false>;
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

  let extracted_api_server_id: ApiServerId | undefined = undefined;
  async function parseApiServerIdFromAdditionalsOptsObject(): Promise<ApiServerId> {
    const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
      opts?.api_server_id,
    );
    if (!parsed_api_server_id.success) {
      console.error(
        "[withAuthenticatedServerComponentRouteGuard] Did not receive a valid API server ID from withAuthenticatedServerComponentRouteGuard additional options object: ",
        parsed_api_server_id.error,
      );
      throw parsed_api_server_id.error;
    }
    return parsed_api_server_id.data;
  }

  try {
    if (
      typeof opts?.api_server_id === "string" &&
      opts.api_server_id.length > 0
    ) {
      await parseApiServerIdFromAdditionalsOptsObject();
    }
  } catch (e: unknown) {
    console.error(
      "[withAuthenticatedServerComponentRouteGuard] Received bad 'api_server_id' in options object: ",
      e,
    );
    redirectWithError(redirect, 500, "server_misconfiguration");
  }

  async function parseApiServerIdFromEnvironmentVariables(): Promise<ApiServerId> {
    const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
      getSchemavaultsApiServerId(),
    );
    if (!parsed_api_server_id.success) {
      console.error(
        "[withAuthenticatedServerComponentRouteGuard] Did not receive a valid API server ID from withAuthenticatedServerComponentRouteGuard additional options object: ",
        parsed_api_server_id.error,
      );
      throw parsed_api_server_id.error;
    }
    return parsed_api_server_id.data;
  }

  // only parse from environment variables if we are not manually supplying an api server id
  if (typeof extracted_api_server_id === "undefined") {
    try {
      extracted_api_server_id =
        await parseApiServerIdFromEnvironmentVariables();
    } catch (e: unknown) {
      console.error(
        "[withAuthenticatedServerComponentRouteGuard] Failed to parse 'api_server_id' from environment variables: ",
        e,
      );
      redirectWithError(redirect, 500, "server_misconfiguration");
    }
  }

  console.assert(
    typeof extracted_api_server_id === "string",
    "[withAuthenticatedServerComponentRouteGuard] Expected 'extracted_api_server_id' to be a string if this point was reached!",
  );
  if (typeof extracted_api_server_id !== "string") {
    redirectWithError(redirect, 500, "internal_server_error");
  }
  const api_server_id: ApiServerId = extracted_api_server_id;

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

  if (user.disabled) {
    return redirectWithError(redirect, 403, "account_disabled");
  }

  if (!route_guard.isAccessAllowed()) {
    redirectWithError(redirect, 403, "forbidden");
  }

  if (!user.admin && route_guard_type === "admin") {
    redirectWithError(redirect, 403, "forbidden");
  }

  if (typeof server_component !== "function") {
    throw new TypeError(
      "Expected 'server_component' passed to withAuthenticatedServerComponentRouteGuard to be a function",
    );
  }
  const ProtectedAuthenticatedPageServerComponent = server_component;

  async function isUserInOrganization(
    user: UserData,
    org_id: OrganizationID,
  ): Promise<OrganizationMembershipRoleType | false> {
    if (!(await userDataSchema.safeParseAsync(user)).success) {
      throw new TypeError(
        "Invalid user data object to lookup organization role for!",
      );
    } else if (!(await organizationIdSchema.safeParseAsync(org_id)).success) {
      throw new TypeError("Invalid organization ID to check user's role for!");
    }

    const custom_is_user_in_organization = opts?.custom_is_user_in_organization;

    if (
      api_server_id === SCHEMAVAULTS_AUTH_APP_ID &&
      typeof custom_is_user_in_organization !== "function"
    ) {
      throw new TypeError(
        "A 'custom_is_user_in_organization' method must be passed to route guard when used for @schemavaults/auth-server!",
      );
    }

    if (typeof custom_is_user_in_organization === "function") {
      const org_role: OrganizationMembershipRoleType | false =
        await custom_is_user_in_organization(user, org_id);
      return org_role;
    }

    const auth_server_url = getSchemaVaultsAuthServerUri();
    const jwks_access_private_key = await loadJwksAccessPrivateKey();

    // this is not the auth-server! we need to ask the auth-server if user is in org
    const org_role: OrganizationMembershipRoleType | false =
      await isUserInOrganizationFromAuthServer(
        auth_server_url,
        api_server_id,
        jwks_access_private_key,
        user.uid,
        org_id,
      );
    return org_role;
  }

  const base_server_component_props: IBaseProtectedAuthenticatedServerComponentPageProps =
    {
      user,
      environment,
      isUserInOrganization,
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
    let org_role: OrganizationMembershipRoleType | false = false;
    try {
      org_role = await isUserInOrganization(user, opts.required_organization);
    } catch (e: unknown) {
      console.error(
        "[withAuthenticatedServerComponentRouteGuard] Organization membership check failed: ",
        e,
      );
      redirectWithError(redirect, 500, "internal_server_error");
    }

    if (org_role === false || !org_role) {
      console.warn(`[withAuthenticatedServerComponentRouteGuard]`);
      redirectWithError(redirect, 403, "account_not_in_organization");
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
