import AdminRequiredRouteGuard from "./admin";
import AuthenticationRequiredRouteGuard from "./authenticated";
import type { IRouteGuard } from "./IRouteGuard";
import { z } from "zod";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import {
  decodeJWTs,
  type PotentiallyValidTokenSource,
  type UserData,
  type DecodeTokenFn,
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import {
  type CustomJWTPayload,
  decodeJWT as decodeSchemavaultsJwt,
  getKeysetIdFromToken,
} from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
  getAppEnvironment,
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import loadJwtDecodingKeys, {
  type IDecodeAuthTokenKeys,
} from "@/JwtKeyManager/loadJwtDecodingKeys";
import {
  RemoteJwtKeyManager,
  type IJwtKeyManager,
  JwtDecodingKeysetNotFoundError,
} from "@/JwtKeyManager";
import isValidUuid from "@/is-valid-uuid";

export interface RouteGuardFactoryInitOptions {
  environment: SchemaVaultsAppEnvironment;
  jwt_keys_manager?: IJwtKeyManager;
  is_auth_server?: boolean;
  debug?: boolean;
}

type DecodeTokenFnOutput = Awaited<ReturnType<DecodeTokenFn>>;

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
      this.jwt_keys_manager = opts.jwt_keys_manager;
    } else {
      if (this.is_auth_server) {
        throw new TypeError(
          "An argument for 'jwt_keys_manager' is required when 'is_auth_server' is true",
        );
      }
      const auth_server_uri: string = getHardcodedClientWebAppDomain(
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        environment,
      );
      this.jwt_keys_manager = new RemoteJwtKeyManager({
        auth_server_uri,
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
  ): Promise<IRouteGuard> {
    const environment: SchemaVaultsAppEnvironment = this.environment;
    const debug: boolean = this.debug;
    if (debug) {
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

    const keys_manager: IJwtKeyManager = this.jwt_keys_manager;
    if (!keys_manager) {
      throw new Error(
        "Failed to resolve reference to JWT keys manager to operate this route guard!",
      );
    }

    let user: UserData | null = null;
    let user_organizations: readonly OrganizationID[] | null = null;
    try {
      user = await decodeJWTs(
        {
          token_sources,
          jwt_audience,
          decodeJWT: async (opts): Promise<DecodeTokenFnOutput> => {
            if (debug) {
              let debugMessage: string = `[RouteGuardFactory] Attempting to decode ${opts.type} JWT for audience: '${opts.jwt_audience}'`;
              if (opts.sourceHint) {
                debugMessage += ` (Source: '${opts.sourceHint}')`;
              }
              console.log(debugMessage);
            }

            let keyset_id: string;
            try {
              keyset_id = getKeysetIdFromToken(opts.token satisfies string);
            } catch (e: unknown) {
              console.error("Failed to load 'keyset_id' from auth token: ", e);
              throw new Error("Failed to load 'keyset_id' from auth token!");
            }

            if (!keyset_id || !isValidUuid(keyset_id)) {
              throw new TypeError(
                "Expected 'keyset_id' from token to be a valid UUID!",
              );
            }

            let decodingKeys: IDecodeAuthTokenKeys;
            try {
              decodingKeys = await loadJwtDecodingKeys({
                keyset_id,
                keys_manager,
                audience_id: jwt_audience,
                debug,
              });
              if (decodingKeys.keyset_id !== keyset_id) {
                throw new Error(
                  "Mismatch between the keyset ID of result and what was requested!",
                );
              }
            } catch (e: unknown) {
              console.warn(
                `[createGuardFromTokenSources] Failed to load keys associated with token-associated keyset '${keyset_id}': `,
                e,
              );
              if (e instanceof JwtDecodingKeysetNotFoundError) {
                throw e;
              }
              throw new Error(
                "Failed to load keys associated with token-associated keyset!",
              );
            }
            const { decryption_key, verification_key } = decodingKeys;

            try {
              return (await decodeSchemavaultsJwt({
                jwt: opts.token,
                type: opts.type,
                audience: opts.jwt_audience,
                decryption_key,
                verification_key,
                keyset_id,
                env: environment,
              })) satisfies CustomJWTPayload;
            } catch (e: unknown) {
              console.error("Failed to decode JSON web token: ", e);
              throw new Error("Failed to decode JSON web token!");
            }
          },
        },
        debug,
      );
      if (!("orgs" in user) || !Array.isArray(user.orgs)) {
        throw new Error("No 'orgs' field in decoded user object!");
      }

      if (
        user.orgs.every(
          (org_id) =>
            typeof org_id === "string" &&
            organizationIdSchema.safeParse(org_id).success,
        )
      ) {
        user_organizations = user.orgs;
      }

      if (!Array.isArray(user_organizations)) {
        throw new TypeError(
          "Failed to load user organizations associated with user from token!",
        );
      }
    } catch (e: unknown) {
      if (e instanceof JwtDecodingKeysetNotFoundError) {
        console.warn(
          `[createdGuardFromTokenSources] Failed to load keyset '${e.keyset_id}' associated with provided token: `,
          e,
        );
      } else {
        console.warn(
          "No-op error creating route-guard... Failed to decode JWTs, setting user = null",
          e,
        );
      }
      user = null;
      user_organizations = null;
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

    return this.createGuardFromOptions(type, init_opts);
  }

  public async createGuardFromAuthHeader(
    type: RouteGuardType,
    authHeader: string | null,
    jwt_audience: string,
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
    );
  }
}

export default RouteGuardFactory;
