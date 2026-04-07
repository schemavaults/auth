import { getAppEnvironment } from "@/get-app-environment";
import {
  decodeJWTs,
  type UserData,
  type PotentiallyValidTokenSource,
  userDataSchema,
} from "@schemavaults/auth-common";
import {
  type IDecodeAuthTokenKeys,
  JwtDecodingKeysetNotFoundError,
  loadJwtDecodingKeys,
  type IJwtKeyManager,
} from "@/JwtKeyManager";
import {
  apiServerIdSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import {
  decodeJWT as decodeSchemavaultsJwt,
  getKeysetIdFromToken,
  customJwtPayloadToUserData,
} from "@schemavaults/jwt";
import isValidUuid from "@/is-valid-uuid";

export type IDecodeJWTsWithKeyManagerOutput =
  | {
      user: UserData;
    }
  | {
      user: null;
    };

export async function decodeJWTsWithKeyManager(
  keys_manager: IJwtKeyManager,
  token_sources: readonly PotentiallyValidTokenSource[],
  jwt_audience: string = getSchemavaultsApiServerId(),
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  debug: boolean = false,
): Promise<IDecodeJWTsWithKeyManagerOutput> {
  if (debug) {
    console.log(
      `[decodeJWTsWithKeyManager] Attempting to decode JWTs from token sources: `,
      token_sources,
    );
  }

  if (!apiServerIdSchema.safeParse(jwt_audience satisfies string).success) {
    throw new TypeError(
      `Invalid API server ID for 'jwt_audience': ${jwt_audience}`,
    );
  }

  if (!keys_manager) {
    throw new TypeError(
      "Failed to resolve reference to JWT keys manager to load keys to perform decode!",
    );
  }

  let decoded_user: UserData | null = null;
  try {
    const user: UserData = await decodeJWTs(
      {
        token_sources,
        jwt_audience,
        decodeJWT: async (opts): Promise<UserData> => {
          if (debug) {
            let debugMessage: string = `[decodeJWTsWithKeyManager] Attempting to decode ${opts.type} JWT for audience: '${opts.jwt_audience}'`;
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
            const jwtPayload = await decodeSchemavaultsJwt({
              jwt: opts.token,
              type: opts.type,
              audience: opts.jwt_audience,
              decryption_key,
              verification_key,
              keyset_id,
              env: environment,
            });
            return customJwtPayloadToUserData(jwtPayload);
          } catch (e: unknown) {
            console.error("Failed to decode JSON web token: ", e);
            throw new Error("Failed to decode JSON web token!");
          }
        },
      },
      debug,
    );

    decoded_user = user;
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
  }

  if (decoded_user) {
    const parsed_user = await userDataSchema.safeParseAsync(decoded_user);
    if (!parsed_user.success) {
      console.warn(
        "Received invalid user data from JWT decode operation: ",
        parsed_user.error,
      );

      return {
        user: null,
      };
    }
    const user: UserData = parsed_user.data;

    return {
      user,
    };
  }

  return {
    user: null,
  };
}

export default decodeJWTsWithKeyManager;
