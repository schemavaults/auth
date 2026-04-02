// route-guard-factory.ts

import AdminRequiredRouteGuard from "./admin";
import AuthenticationRequiredRouteGuard from "./authenticated";
import type { IRouteGuard } from "./IRouteGuard";
import { z } from "zod";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import type {
  PotentiallyValidTokenSource,
  OrganizationID,
  UserData,
} from "@schemavaults/auth-common";
import {
  type ApiServerId,
  apiServerIdSchema,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { RemoteJwtKeyManager, type IJwtKeyManager } from "@/JwtKeyManager";
import getSchemaVaultsAuthServerUri from "@/get-schemavaults-auth-server-uri";
import decodeJWTsWithKeyManager from "@/decode-jwts-with-key-manager";

export interface RouteGuardFactoryInitOptions {
  environment: SchemaVaultsAppEnvironment;
  jwt_keys_manager?: IJwtKeyManager;
  is_auth_server?: boolean;
  debug?: boolean;
}

const GUARD_TYPES = [
  "authenticated",
  "admin",
] as const satisfies readonly string[];

type RouteGuardType = (typeof GUARD_TYPES)[number];
const validGuardTypeSchema = z.string().refine((str): str is RouteGuardType => {
  return (
    GUARD_TYPES satisfies readonly string[] as readonly string[]
  ).includes(str);
});

const GUARDS = {
  authenticated: (opts) => new AuthenticationRequiredRouteGuard(opts),
  admin: (opts) => new AdminRequiredRouteGuard(opts),
} as const satisfies Record<
  RouteGuardType,
  (opts: InitRouteGuardCheckOptions) => IRouteGuard
>;

export class RouteGuardFactory {
  private readonly jwt_keys_manager: IJwtKeyManager;
  private readonly environment: SchemaVaultsAppEnvironment;
  private readonly debug: boolean;
  private readonly is_auth_server: boolean;

  public constructor({ environment, ...opts }: RouteGuardFactoryInitOptions) {
    this.environment = environment;
    this.debug = opts.debug ?? false;
    if (
      typeof opts.is_auth_server !== "boolean" &&
      typeof opts.is_auth_server !== "undefined"
    ) {
      throw new TypeError("Invalid value for 'is_auth_server'");
    }
    this.is_auth_server = opts.is_auth_server ?? false;

    if (opts.jwt_keys_manager) {
      if (this.debug) {
        console.log(
          "[RouteGuardFactory] Using custom 'jwt_keys_manager' from constructor options!",
        );
      }
      this.jwt_keys_manager = opts.jwt_keys_manager;
    } else {
      if (this.is_auth_server) {
        throw new TypeError(
          "An argument for 'jwt_keys_manager' is required when 'is_auth_server' is true",
        );
      }
      if (this.debug) {
        console.log(
          "[RouteGuardFactory] Creating default 'jwt_keys_manager' for remote resource server (loads keys from auth server)!",
        );
      }
      this.jwt_keys_manager = new RemoteJwtKeyManager({
        auth_server_uri: getSchemaVaultsAuthServerUri(),
        debug: this.debug,
      });
    }
  }

  private static isValidRouteGuardType(type: unknown): type is RouteGuardType {
    if (typeof type !== "string") return false;
    return validGuardTypeSchema.safeParse(type).success;
  }

  public static createGuardFromOptions(
    type: RouteGuardType,
    opts: InitRouteGuardCheckOptions,
  ): IRouteGuard {
    if (!RouteGuardFactory.isValidRouteGuardType(type)) {
      throw new Error(
        `Invalid route guard type, should be one of: ${GUARD_TYPES.join(", ")}`,
      );
    }
    const GUARD_LOADER = GUARDS[type];
    const GUARD: IRouteGuard = GUARD_LOADER(opts);

    return GUARD;
  }

  public createGuardFromOptions(
    type: RouteGuardType,
    opts: InitRouteGuardCheckOptions,
  ): IRouteGuard {
    return RouteGuardFactory.createGuardFromOptions(type, opts);
  }

  public async createGuardFromTokenSources(
    type: RouteGuardType,
    token_sources: readonly PotentiallyValidTokenSource[],
    jwt_audience: ApiServerId,
    loadUserOrganizations: (
      user: UserData,
    ) => Promise<readonly OrganizationID[]>,
  ): Promise<IRouteGuard> {
    if (this.debug) {
      console.log(
        `[RouteGuardFactory] Initializing route guard from token sources: `,
        token_sources,
      );
    }

    if (!apiServerIdSchema.safeParse(jwt_audience satisfies string).success) {
      throw new TypeError(
        `Invalid API server ID for 'jwt_audience': ${jwt_audience}`,
      );
    }

    if (!this.jwt_keys_manager) {
      throw new Error(
        "Failed to resolve reference to JWT keys manager to operate this route guard!",
      );
    }

    const { user, user_organizations } = await decodeJWTsWithKeyManager(
      this.jwt_keys_manager,
      token_sources,
      loadUserOrganizations,
      jwt_audience,
      this.environment,
      this.debug,
    );

    if (user && !Array.isArray(user_organizations)) {
      throw new TypeError(
        "Expected 'user_organizations' to be an array if 'user' was truthy!",
      );
    }

    const init_opts: InitRouteGuardCheckOptions = {
      user,
      environment: getAppEnvironment(),
      user_organizations: user_organizations ?? [],
    };

    if (this.debug) {
      console.log(
        `[RouteGuardFactory] Creating route guard with init options: `,
        init_opts,
      );
    }

    return this.createGuardFromOptions(type, init_opts) satisfies IRouteGuard;
  }

  public async createGuardFromAuthHeader(
    type: RouteGuardType,
    authHeader: string | null,
    jwt_audience: string,
    loadUserOrganizations: (
      user: UserData,
    ) => Promise<readonly OrganizationID[]>,
  ): Promise<IRouteGuard> {
    if (!authHeader || typeof authHeader !== "string") {
      throw new Error("No auth header found");
    }
    const bearerPrefix = "Bearer " as const;
    if (!authHeader.startsWith(bearerPrefix)) {
      throw new Error("Auth header should have a 'Bearer' prefix");
    }
    const token: string = authHeader.slice(bearerPrefix.length);

    return await this.createGuardFromTokenSources(
      type,
      [
        {
          sourceHint: "Auth Header Access Token",
          token,
          type: "access",
        },
      ],
      jwt_audience,
      loadUserOrganizations,
    );
  }
}

export default RouteGuardFactory;
