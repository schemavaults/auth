import {
  type ApiServerId,
  SCHEMAVAULTS_AUTH_APP_ID,
  type SchemaVaultsAppEnvironment,
  getAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  type AccessToken,
  accessTokenDataSchema,
  isValidOrganizationID,
  organizationIdSchema,
  type PotentiallyValidTokenSource,
  type UserData,
  userDataSchema,
} from "@schemavaults/auth-common";
import type {
  OrganizationID,
  OrganizationMembershipRoleType,
} from "@schemavaults/auth-common/organizations";
import isUserInOrganizationFromAuthServer from "@/isUserInOrganization";
import getSchemaVaultsAuthServerUri from "@/env/get-schemavaults-auth-server-uri";
import loadJwksAccessPrivateKey from "@/env/loadJwksAccessPrivateKey/loadJwksAccessPrivateKey";
import type { IRouteGuard } from "@/route_guards/IRouteGuard";
import RouteGuardFactory from "@/route_guards/route-guard-factory";
import type { NextRequest, NextResponse } from "next/server";
import getStringByteSize from "@/getStringByteSize";
import MaximumBrowserCookieSize from "@/MaximumBrowserCookieSize";
import { AccessTokenCookieName } from "@/AccessTokenCookieNames";
import { RefreshTokenCookieName } from "@/RefreshTokenCookieNames";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import assertValidRouteGuardType from "@/route_guards/assertValidRouteGuardType";
import type { IBaseProtectedAuthenticatedApiRouteInputs } from "./IBaseProtectedAuthenticatedApiRouteInputs";
import initDefaultJwtKeyManagerForAuthenticatedRouteGuard from "./initDefaultJwtKeyManagerForAuthenticatedRouteGuard";

export type TProtectedAuthenticatedApiRoute<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
> = (route_inputs: TRouteInputs) => Promise<NextResponse>;

type TAdditionalRouteInputs<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
> = Omit<TRouteInputs, keyof IBaseProtectedAuthenticatedApiRouteInputs>;

type CreateJsonResponseFn = (typeof NextResponse)["json"];

async function loadCreateJsonResponseFn(): Promise<CreateJsonResponseFn> {
  const jsonPromise: Promise<CreateJsonResponseFn> = import("next/server")
    .then((mod) => mod.NextResponse)
    .then((mod) => mod.json);
  const json_response_fn = await jsonPromise;
  if (typeof json_response_fn !== "function") {
    throw new TypeError("Expected 'json' to be a function!");
  }
  return json_response_fn;
}

export interface IWithAuthenticatedApiRouteGuardAdditionalOptions<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
> {
  route_guard_type?: "authenticated" | "admin";
  jwt_keys_manager?: IJwtKeyManager;
  api_server_id?: ApiServerId;
  custom_is_authorized_check?: (props: TRouteInputs) => Promise<boolean>;
  required_organization?: OrganizationID;
  custom_is_user_in_organization?: (
    user: UserData,
    org_id: OrganizationID,
  ) => Promise<OrganizationMembershipRoleType | false>;
}

export function withAuthenticatedApiRouteGuard<
  TRouteInputs extends IBaseProtectedAuthenticatedApiRouteInputs =
    IBaseProtectedAuthenticatedApiRouteInputs,
>(
  api_route_handler: TProtectedAuthenticatedApiRoute<TRouteInputs>,
  additional_custom_api_route_inputs:
    | TAdditionalRouteInputs<TRouteInputs>
    | undefined = undefined,
  opts?: IWithAuthenticatedApiRouteGuardAdditionalOptions,
): (req: NextRequest) => Promise<NextResponse> {
  const route_guard_type: "authenticated" | "admin" =
    opts?.route_guard_type ?? "authenticated";
  assertValidRouteGuardType(route_guard_type);

  const AuthenticatedApiRoute: TProtectedAuthenticatedApiRoute<TRouteInputs> =
    api_route_handler;
  return async function ProtectedAuthenticatedApiRoute(
    req: NextRequest,
  ): Promise<NextResponse> {
    const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

    const api_server_id: ApiServerId =
      opts?.api_server_id ?? getSchemavaultsApiServerId();
    try {
      if (typeof api_server_id !== "string") {
        throw new TypeError(
          "Expected result of 'getApiServerId' to be a string!",
        );
      }
    } catch (e: unknown) {
      console.error(
        "[withAuthenticatedApiRouteGuard] getApiServerId() failed: ",
        e,
      );
      const json: CreateJsonResponseFn = await loadCreateJsonResponseFn();
      return json(
        {
          success: false,
          error: true,
          message: "Internal Server Error",
        },
        {
          status: 500,
        },
      );
    }

    const jwt_keys_manager: IJwtKeyManager =
      opts?.jwt_keys_manager ??
      initDefaultJwtKeyManagerForAuthenticatedRouteGuard();
    if (!jwt_keys_manager.isConfigured()) {
      console.error(
        "[withAuthenticatedApiRouteGuard] JWT Keys Manager does not appear to be properly configured!",
      );
      const json: CreateJsonResponseFn = await loadCreateJsonResponseFn();
      return json(
        {
          success: false,
          error: true,
          message: "Internal Server Error",
        },
        {
          status: 500,
        },
      );
    }

    const token_sources: PotentiallyValidTokenSource[] = [];

    // Load refresh token cookie for auth server
    if (api_server_id === SCHEMAVAULTS_AUTH_APP_ID) {
      const refresh_token_cookie = req.cookies.get(
        RefreshTokenCookieName(SCHEMAVAULTS_AUTH_APP_ID),
      );
      if (
        typeof refresh_token_cookie?.value === "string" &&
        refresh_token_cookie.value.length > 64 &&
        getStringByteSize(refresh_token_cookie.value) <=
          MaximumBrowserCookieSize
      ) {
        token_sources.push({
          sourceHint: "Auth Server Refresh Token",
          type: "refresh",
          token: refresh_token_cookie.value satisfies string,
        });
      } else {
        console.warn(
          "There does not appear to be a refresh token cookie for the auth server!",
        );
      }
    }

    // Load access token cookie for current server
    // Access token cookie is set with JSON.stringify() of an AccessToken object-- need to parse the .token property
    await (async function addAccessTokenFromCookieToSourcesIfFound(): Promise<void> {
      const access_token_cookie_name: string =
        AccessTokenCookieName(api_server_id);
      const access_token_cookie = req.cookies.get(access_token_cookie_name);
      if (
        typeof access_token_cookie?.value === "string" &&
        access_token_cookie.value.length > 64 &&
        getStringByteSize(access_token_cookie.value) <= MaximumBrowserCookieSize
      ) {
        let jwt_string: string | null = null;
        try {
          const parsed = await accessTokenDataSchema.safeParseAsync(
            JSON.parse(access_token_cookie.value),
          );
          if (!parsed.success) {
            throw parsed.error;
          }
          const parsed_access_token_object: AccessToken = parsed.data;
          if (Date.now() < parsed_access_token_object.exp) {
            jwt_string = parsed_access_token_object.token;
          }
        } catch {
          // Raw JWT string fallback
          jwt_string = access_token_cookie.value;
        }
        if (jwt_string) {
          token_sources.push({
            sourceHint: `Access Token from cookie '${access_token_cookie_name}'`,
            type: "access",
            token: jwt_string,
          });
        }
      }
    })();

    // Load access token header for current server
    (function addAccessTokenFromAuthorizationHeaderIfFound(): void {
      if (
        req.headers.has("Authorization") ||
        req.headers.has("authorization")
      ) {
        const auth_header: string | null =
          req.headers.get("Authorization") ?? req.headers.get("authorization");
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
        const access_token_from_header: string =
          typeof auth_header === "string" && auth_header.startsWith("Bearer ")
            ? auth_header.slice("Bearer ".length)
            : "";
        if (!access_token_from_header) {
          throw new Error(`Header 'Authorization' appears to be empty!`);
        }
        token_sources.push({
          sourceHint: "Access Token from Authorization Bearer header",
          type: "access",
          token: access_token_from_header satisfies string,
        });
      }
    })();

    const json: CreateJsonResponseFn = await loadCreateJsonResponseFn();

    if (token_sources.length === 0) {
      console.warn("No token sources found for API route request.");
      return json(
        {
          success: false,
          error: true,
          message: "Authentication failed, no token sources found for request",
        },
        { status: 401 },
      );
    }

    const route_guard: IRouteGuard = await new RouteGuardFactory({
      environment,
      is_auth_server: api_server_id === SCHEMAVAULTS_AUTH_APP_ID,
      jwt_keys_manager,
    }).createGuardFromTokenSources(
      route_guard_type,
      token_sources,
      api_server_id,
    );

    if (!route_guard.user) {
      return json(
        {
          success: false,
          error: true,
          message: "Authentication failed, unknown user",
        },
        { status: 401 },
      );
    }
    const user: UserData = route_guard.user;

    if (user.disabled) {
      return json(
        {
          success: false,
          error: true,
          message: "Your account is disabled!",
        },
        { status: 403 },
      );
    }

    if (!route_guard.isAccessAllowed() || !route_guard.user) {
      return json(
        {
          success: false,
          error: true,
          message: "Access is not allowed",
        },
        { status: 403 },
      );
    }

    if (!user.admin && route_guard_type === "admin") {
      return json(
        {
          success: false,
          error: true,
          message: "You must be an admin to use this resource",
        },
        { status: 403 },
      );
    }

    async function isUserInOrganization(
      user: UserData,
      org_id: OrganizationID,
    ): Promise<OrganizationMembershipRoleType | false> {
      if (!(await userDataSchema.safeParseAsync(user)).success) {
        throw new TypeError(
          "Invalid user data object to lookup organization role for!",
        );
      } else if (!(await organizationIdSchema.safeParseAsync(org_id)).success) {
        throw new TypeError(
          "Invalid organization ID to check user's role for!",
        );
      }

      const custom_is_user_in_organization =
        opts?.custom_is_user_in_organization;

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

    if (opts?.required_organization && !user.admin) {
      const required_organization: OrganizationID = opts?.required_organization;
      if (!isValidOrganizationID(required_organization)) {
        console.error(
          "[withAuthenticatedApiRouteGuard] Invalid organization ID passed as 'required_organization'!",
        );
        return json(
          {
            success: false,
            error: true,
            message: "Server does not appear to be properly configured!",
          },
          { status: 500 },
        );
      }

      let org_role: OrganizationMembershipRoleType | false = false;
      try {
        org_role = await isUserInOrganization(user, required_organization);
      } catch (e: unknown) {
        console.error(
          "[withAuthenticatedApiRouteGuard] Organization membership check failed: ",
          e,
        );
        return json(
          {
            success: false,
            error: true,
            message: "Error while checking organization membership",
          },
          { status: 500 },
        );
      }

      if (org_role === false || !org_role) {
        console.warn(
          `[withAuthenticatedApiRouteGuard] User '${user.uid}' does not appear to be in required organization '${required_organization}'!`,
        );
        return json(
          {
            success: false,
            error: true,
            message: "User is not a member of the required organization",
          },
          { status: 403 },
        );
      }
    }

    const base_api_route_inputs: IBaseProtectedAuthenticatedApiRouteInputs = {
      req,
      user,
      environment,
      isUserInOrganization,
    };

    const final_route_inputs: TRouteInputs =
      typeof additional_custom_api_route_inputs === "object" &&
      additional_custom_api_route_inputs
        ? ({
            ...base_api_route_inputs,
            ...additional_custom_api_route_inputs,
          } as unknown as TRouteInputs)
        : (base_api_route_inputs as unknown as TRouteInputs);

    const custom_is_authorized_check:
      | ((route_inputs: TRouteInputs) => Promise<boolean>)
      | undefined = opts?.custom_is_authorized_check;
    if (typeof custom_is_authorized_check === "function") {
      let is_authorized: boolean = false;
      try {
        is_authorized = await custom_is_authorized_check(final_route_inputs);
      } catch (e: unknown) {
        console.error("Error in 'custom_is_authorized_check' handler: ", e);
        return json(
          {
            success: false,
            error: true,
            message: "Error while checking if access is allowed",
          },
          { status: 500 },
        );
      }
      if (!is_authorized) {
        return json(
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
      final_route_inputs,
    )) satisfies NextResponse;
  };
}

export default withAuthenticatedApiRouteGuard;
