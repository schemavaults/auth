import { AdminRequiredRouteGuard } from "./admin";
import { AuthenticationRequiredRouteGuard } from "./authenticated";
import type { IRouteGuard } from "./base-route-guard";
import { z } from "zod";
import type { InitRouteGuardCheckOptions } from "./init_route_guard_check_options";
import {
  decodeFirstOfSeveralJwts,
  type PotentiallyValidTokenSource,
  type UserData,
  type DecodeTokenFn,
} from "@schemavaults/auth-common";
import { decodeJWT, getKeysetIdFromToken } from "@schemavaults/jwt";
import {
  apiServerIdSchema,
  getAppEnvironment,
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import loadJwtDecodingKeys, {
  type IDecodeAuthTokenKeys,
} from "@/JwtKeyManager/loadJwtDecodingKeys";
import { RemoteJwtKeyManager, type IJwtKeyManager } from "@/JwtKeyManager";

export interface RouteGuardFactoryInitOptions {
  environment: SchemaVaultsAppEnvironment;
  jwt_keys_manager?: IJwtKeyManager;
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
  public static jwt_keys_manager: IJwtKeyManager | null = null;
  private static _instance: RouteGuardFactory;
  private readonly environment: SchemaVaultsAppEnvironment;

  private constructor({ environment }: RouteGuardFactoryInitOptions) {
    this.environment = environment;
  }

  private static isValidRouteGuardType(type: unknown): type is RouteGuardType {
    if (typeof type !== "string") return false;
    return validGuardTypeSchema.safeParse(type).success;
  }

  public createGuardFromOptions(
    type: RouteGuardType,
    opts: InitRouteGuardCheckOptions,
  ): IRouteGuard {
    if (!RouteGuardFactory.isValidRouteGuardType(type)) {
      throw new Error(
        `Invalid route guard type, should be one of: ${GUARD_TYPES.join(", ")}`,
      );
    }
    const GUARD_LOADER = GUARDS[type];
    const GUARD = GUARD_LOADER(opts);

    return GUARD;
  }

  public async createGuardFromTokenSources(
    type: RouteGuardType,
    token_sources: readonly PotentiallyValidTokenSource[],
    jwt_audience: string,
  ): Promise<IRouteGuard> {
    const environment: SchemaVaultsAppEnvironment = this.environment;
    if (environment !== "production") {
      console.log(
        `[RouteGuardFactory] Initializing route guard from token sources: `,
        token_sources,
      );
    }

    if (!apiServerIdSchema.safeParse(jwt_audience).success) {
      throw new TypeError(
        `Invalid API server ID for 'jwt_audience': ${jwt_audience}`,
      );
    }

    let user: UserData | null = null;

    try {
      user = await decodeFirstOfSeveralJwts({
        token_sources,
        jwt_audience,
        decodeJWT: async (opts): Promise<DecodeTokenFnOutput> => {
          if (environment !== "production") {
            console.log(`[RouteGuardFactory] Attempting to decode JWT...`);
          }

          let keyset_id: string;
          try {
            keyset_id = getKeysetIdFromToken(opts.token satisfies string);
          } catch (e: unknown) {
            console.error("Failed to load 'keyset_id' from auth token: ", e);
            throw new Error("Failed to load 'keyset_id' from auth token!");
          }

          const isAuthServer: boolean =
            jwt_audience === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;

          let keys_manager: IJwtKeyManager;
          if (RouteGuardFactory.jwt_keys_manager) {
            keys_manager = RouteGuardFactory.jwt_keys_manager;
          } else {
            if (isAuthServer) {
              console.error(
                "[RouteGuardFactory] " +
                  "Failed to resolve JWT keys manager on auth server! " +
                  "Please ensure the keys manager is set up with: 'RouteGuardFactory.jwt_keys_manager = ______'",
              );
              throw new Error(
                "Failed to resolve JWT keys manager on auth server!",
              );
            }
            keys_manager = new RemoteJwtKeyManager({
              auth_server_uri: getHardcodedClientWebAppDomain(
                SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
                environment,
              ),
            });
          }

          let decodingKeys: IDecodeAuthTokenKeys;
          try {
            decodingKeys = await loadJwtDecodingKeys({
              keyset_id,
              keys_manager,
              audience_id: jwt_audience,
            });
            if (decodingKeys.keyset_id !== keyset_id) {
              throw new Error(
                "Mismatch between the keyset ID of result and what was requested!",
              );
            }
          } catch (e: unknown) {
            console.error(
              `Failed to load keys associated with token-associated keyset '${keyset_id}': `,
              e,
            );
            throw new Error(
              "Failed to load keys associated with token-associated keyset!",
            );
          }
          const { decryption_key, verification_key } = decodingKeys;

          try {
            return await decodeJWT({
              jwt: opts.token,
              type: opts.type,
              audience: opts.jwt_audience,
              decryption_key,
              verification_key,
              keyset_id,
              env: environment,
            });
          } catch (e: unknown) {
            console.error("Failed to decode JSON web token: ", e);
            throw new Error("Failed to decode JSON web token!");
          }
        },
      });
    } catch (e: unknown) {
      console.error(
        "No-op error creating route-guard... Failed to decode JWTs, setting user = null",
        e,
      );
      user = null;
    }

    const init_opts: InitRouteGuardCheckOptions = {
      user,
      environment: getAppEnvironment(),
    };

    if (this.environment !== "production") {
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

  public static getInstance(
    jwt_keys_manager?: IJwtKeyManager,
  ): RouteGuardFactory {
    if (!RouteGuardFactory._instance) {
      function initRouteGuardFactory(): RouteGuardFactory {
        const environment = getAppEnvironment();

        if (jwt_keys_manager && !RouteGuardFactory.jwt_keys_manager) {
          RouteGuardFactory.jwt_keys_manager = jwt_keys_manager;
        }

        return new RouteGuardFactory({
          environment,
          jwt_keys_manager,
        });
      }
      RouteGuardFactory._instance = initRouteGuardFactory();
    }
    return RouteGuardFactory._instance;
  }
}
