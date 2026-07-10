import {
  type ApiServerId,
  type SchemaVaultsAppEnvironment,
  apiServerIdSchema,
  getAppEnvironment,
  getAuthServerAppId,
} from "@schemavaults/app-definitions";
import {
  isValidOrganizationID,
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
import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-url";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey/loadJwksAccessPrivateKey";
import type { IRouteGuard } from "@/route_guards/IRouteGuard";
import type { ReactElement } from "react";
import { redirectWithError } from "@/redirect-with-error";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import { RefreshTokenCookieName } from "@/RefreshTokenCookieNames";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import { JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME } from "@/env/loadJwksAccessPrivateKey";
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
  /**
   * Path to the error page that `redirectWithError` should redirect to.
   * Defaults to `/auth/error` for resource servers; the auth-server itself
   * should pass `/error` since its error route lives at the app root.
   */
  error_page_url?: string;
  debug?: boolean;
}

/** Method Name (to shorten logs) */
const name = "withAuthenticatedServerComponentRouteGuard" as const;

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
  const debug: boolean = typeof opts?.debug === "boolean" ? opts.debug : false;

  const route_guard_type: "authenticated" | "admin" =
    opts?.route_guard_type ?? "authenticated";
  assertValidRouteGuardType(route_guard_type);

  if (debug) {
    console.log(
      `[${name}] Running route guard of type "${route_guard_type}"...`,
    );
  }

  if (
    typeof opts?.error_page_url !== "undefined" &&
    typeof opts?.error_page_url !== "string"
  ) {
    throw new TypeError(
      `Expected 'error_page_url' option to be a string or undefined, got ${typeof opts?.error_page_url}`,
    );
  }
  const error_page_url: string = opts?.error_page_url ?? "/auth/error";

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

  function redirectToErrorPage(
    error_code: number,
    error_id: Parameters<typeof redirectWithError>[2],
  ): never {
    return redirectWithError(redirect, error_code, error_id, error_page_url);
  }

  let extracted_api_server_id: ApiServerId | undefined = undefined;
  async function parseApiServerIdFromAdditionalsOptsObject(): Promise<ApiServerId> {
    const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
      opts?.api_server_id,
    );
    if (!parsed_api_server_id.success) {
      console.error(
        `[${name}] Did not receive a valid API server ID from ${name} additional options object: `,
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
      extracted_api_server_id =
        await parseApiServerIdFromAdditionalsOptsObject();
    }
  } catch (e: unknown) {
    console.error(
      `[${name}] Received bad 'api_server_id' in options object (got typeof='${typeof opts?.api_server_id}', value='${String(opts?.api_server_id)}'). Redirecting to error page with 'server_misconfiguration'. Underlying error: `,
      e,
    );
    redirectToErrorPage(500, "server_misconfiguration");
  }

  async function parseApiServerIdFromEnvironmentVariables(): Promise<ApiServerId> {
    const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
      getSchemavaultsApiServerId(),
    );
    if (!parsed_api_server_id.success) {
      console.error(
        `[${name}] Did not receive a valid API server ID from the 'SCHEMAVAULTS_API_SERVER_ID' environment variable: `,
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
        `[${name}] Failed to resolve 'api_server_id'. No 'api_server_id' option was provided and reading the 'SCHEMAVAULTS_API_SERVER_ID' environment variable failed. Redirecting to error page with 'server_misconfiguration'. Underlying error: `,
        e,
      );
      redirectToErrorPage(500, "server_misconfiguration");
    }
  }

  if (typeof extracted_api_server_id !== "string") {
    console.error(
      `[${name}] Failed to parse 'api_server_id' from either the options object or the 'SCHEMAVAULTS_API_SERVER_ID' environment variable. Redirecting to error page with 'server_misconfiguration'.`,
    );
    redirectToErrorPage(500, "server_misconfiguration");
  }
  const api_server_id: ApiServerId = extracted_api_server_id;

  let jwt_keys_manager: IJwtKeyManager;
  if (typeof opts?.jwt_keys_manager !== "undefined") {
    jwt_keys_manager = opts.jwt_keys_manager;
  } else {
    try {
      jwt_keys_manager = initDefaultJwtKeyManagerForAuthenticatedRouteGuard();
    } catch (e: unknown) {
      console.error(
        `[${name}] Failed to construct the default JWT Keys Manager for api_server_id='${api_server_id}'. Redirecting to error page with 'server_misconfiguration'. Underlying error: `,
        e,
      );
      redirectToErrorPage(500, "server_misconfiguration");
    }
  }
  if (!jwt_keys_manager.isConfigured()) {
    // Try to diagnose *why* the manager is unconfigured so the operator can
    // fix the deploy without having to read the SDK source. The default
    // JwtKeyManager (RemoteJwtKeyManager) requires the JWKS access private
    // key env var; if the caller supplied a custom manager, we can't know
    // which env vars it needs, so report only what we can.
    const missing_env_vars: string[] = [];
    if (
      typeof process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME] !== "string" ||
      process.env[JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME].length === 0
    ) {
      missing_env_vars.push(JWKS_ACCESS_PRIVATE_KEY_ENV_VAR_NAME);
    }
    if (
      typeof process.env["SCHEMAVAULTS_API_SERVER_ID"] !== "string" ||
      process.env["SCHEMAVAULTS_API_SERVER_ID"].length === 0
    ) {
      missing_env_vars.push("SCHEMAVAULTS_API_SERVER_ID");
    }
    if (missing_env_vars.length > 0) {
      console.error(
        `[${name}] JWT Keys Manager is not configured for api_server_id='${api_server_id}'. Missing required environment variable(s): ${missing_env_vars
          .map((v) => `'${v}'`)
          .join(
            ", ",
          )}. Redirecting to error page with 'server_misconfiguration'.`,
      );
    } else {
      console.error(
        `[${name}] JWT Keys Manager (${jwt_keys_manager.constructor?.name ?? "unknown"}) reports it is not configured for api_server_id='${api_server_id}', but no missing env vars were detected. A custom 'jwt_keys_manager' option may be missing configuration. Redirecting to error page with 'server_misconfiguration'.`,
      );
    }
    redirectToErrorPage(500, "server_misconfiguration");
  }

  const cookies: RequestCookies = await loadCookies();
  if (!("get" in cookies) || typeof cookies.get !== "function") {
    throw new TypeError(
      "Expected 'cookies' to be a RequestCookies object with a 'get' method!",
    );
  }

  const token_sources: PotentiallyValidTokenSource[] = [];

  const auth_server_app_id = getAuthServerAppId();

  // Load Refresh Token for Auth Server
  if (api_server_id === auth_server_app_id) {
    const refresh_token_cookie = cookies.get(
      RefreshTokenCookieName(auth_server_app_id),
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

  if (debug) {
    console.log(
      `[${name}] Accumulated tokens from ${token_sources.length} sources...`,
    );
  }

  if (token_sources.length === 0) {
    redirectToLogin(redirect);
  }

  const route_guard_factory = new RouteGuardFactory({
    environment,
    is_auth_server: api_server_id === auth_server_app_id,
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
    console.warn(
      `[${name}] Blocking disabled user '${user.uid}' from api_server_id='${api_server_id}'. Redirecting to error page with 'account_disabled'.`,
    );
    return redirectToErrorPage(403, "account_disabled");
  }

  if (!route_guard.isAccessAllowed()) {
    console.warn(
      `[${name}] Access denied for user '${user.uid}' on api_server_id='${api_server_id}' (route_guard.isAccessAllowed() returned false). Redirecting to error page with 'forbidden'.`,
    );
    redirectToErrorPage(403, "forbidden");
  }

  if (!user.admin && route_guard_type === "admin") {
    console.warn(
      `[${name}] Non-admin user '${user.uid}' attempted to access an 'admin' route_guard on api_server_id='${api_server_id}'. Redirecting to error page with 'forbidden'.`,
    );
    redirectToErrorPage(403, "forbidden");
  }

  if (typeof server_component !== "function") {
    throw new TypeError(
      `Expected 'server_component' passed to ${name} to be a function`,
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
      api_server_id === auth_server_app_id &&
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

  if (opts?.required_organization && !user.admin) {
    const required_organization: OrganizationID = opts?.required_organization;
    if (!isValidOrganizationID(required_organization)) {
      console.error(
        `[${name}] Invalid organization ID passed as 'required_organization' option: '${String(required_organization)}'. Redirecting to error page with 'server_misconfiguration'.`,
      );
      redirectToErrorPage(500, "server_misconfiguration");
    }
    let org_role: OrganizationMembershipRoleType | false = false;
    try {
      org_role = await isUserInOrganization(user, required_organization);
    } catch (e: unknown) {
      console.error(
        `[${name}] Organization membership check failed for user '${user.uid}' / required_organization='${required_organization}' / api_server_id='${api_server_id}'. Redirecting to error page with 'internal_server_error'. Underlying error: `,
        e,
      );
      redirectToErrorPage(500, "internal_server_error");
    }

    if (org_role === false || !org_role) {
      console.warn(
        `[${name}] User '${user.uid}' does not appear to be in required organization '${required_organization}'!`,
      );
      redirectToErrorPage(403, "account_not_in_organization");
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
      console.error(
        `[${name}] Error in 'custom_is_authorized_check' handler for user '${user.uid}' on api_server_id='${api_server_id}'. Redirecting to error page with 'internal_server_error'. Underlying error: `,
        e,
      );
      redirectToErrorPage(500, "internal_server_error");
    }
    if (!is_authorized) {
      console.warn(
        `[${name}] 'custom_is_authorized_check' returned false for user '${user.uid}' on api_server_id='${api_server_id}'. Redirecting to error page with 'forbidden'.`,
      );
      redirectToErrorPage(403, "forbidden");
    }
  }

  if (debug) {
    console.log(
      `[${name}] Route guard is allowing access! Rendering server component...`,
    );
  }

  const start_rendering_time: number = Date.now();

  const rendered_protected_server_component: ReactElement =
    await ProtectedAuthenticatedPageServerComponent(
      final_server_component_props,
    );

  const end_rendering_time: number = Date.now();
  const render_duration: number = end_rendering_time - start_rendering_time;

  if (debug) {
    console.log(
      `[${name}] Rendered server component in ${render_duration}ms! Exiting.`,
    );
  }

  return rendered_protected_server_component;
}

export default withAuthenticatedServerComponentRouteGuard;
