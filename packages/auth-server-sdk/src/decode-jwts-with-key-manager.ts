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
  getTokenAudienceForApiServerId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getSchemavaultsApiServerId from "@/env/get-schemavaults-api-server-id";
import {
  decodeJWT as decodeSchemavaultsJwt,
  getKeysetIdFromToken,
  customJwtPayloadToUserData,
  getScopeFromCustomJwtPayload,
} from "@schemavaults/jwt";
import isValidUuid from "@/is-valid-uuid";

// A decoded token: the user identity plus the granted `scope` carried
// ALONGSIDE it (never folded into UserData). `scope` is null when the token
// has no scope claim (issued before scopes became first-class).
interface DecodedTokenWithScope {
  user: UserData;
  scope: string | null;
}

export type IDecodeJWTsWithKeyManagerOutput =
  | {
      user: UserData;
      scope: string | null;
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

  // `jwt_audience` is the stable api server id (used below for keyset
  // lookups), but the token `aud` claim carries the token-audience form (the
  // auth server URL for the auth app; the api server id verbatim otherwise).
  const token_audience: string = getTokenAudienceForApiServerId(
    jwt_audience,
    environment,
  );

  if (!keys_manager) {
    throw new TypeError(
      "Failed to resolve reference to JWT keys manager to load keys to perform decode!",
    );
  }

  let decoded_result: DecodedTokenWithScope | null = null;
  try {
    const decoded: DecodedTokenWithScope = await decodeJWTs<DecodedTokenWithScope>(
      {
        token_sources,
        jwt_audience: token_audience,
        // The consistency check in decodeJWTs compares the user across
        // token sources; pull the user out of the `{ user, scope }` record.
        getUserData: (d: DecodedTokenWithScope): UserData => d.user,
        decodeJWT: async (opts): Promise<DecodedTokenWithScope> => {
          const sourceHintLabel: string =
            typeof opts.sourceHint === "string" && opts.sourceHint.length > 0
              ? opts.sourceHint
              : "(no source hint)";
          const sourceDescription: string = `source: '${sourceHintLabel}', type: '${opts.type}'`;

          if (debug) {
            console.log(
              `[decodeJWTsWithKeyManager] Attempting to decode ${opts.type} JWT for audience: '${opts.jwt_audience}' (${sourceDescription})`,
            );
          }

          let keyset_id: string;
          try {
            keyset_id = getKeysetIdFromToken(opts.token satisfies string);
          } catch (e: unknown) {
            console.error(
              `Failed to load 'keyset_id' from auth token (${sourceDescription}): `,
              e,
            );
            throw new Error(
              `Failed to load 'keyset_id' from auth token! (${sourceDescription})`,
              { cause: e },
            );
          }

          if (!keyset_id || !isValidUuid(keyset_id)) {
            throw new TypeError(
              `Expected 'keyset_id' from token to be a valid UUID! (${sourceDescription})`,
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
              `[createGuardFromTokenSources] Failed to load keys associated with token-associated keyset '${keyset_id}' (${sourceDescription}): `,
              e,
            );
            if (e instanceof JwtDecodingKeysetNotFoundError) {
              throw e;
            }
            throw new Error(
              `Failed to load keys associated with token-associated keyset! (${sourceDescription})`,
              { cause: e },
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
            return {
              user: customJwtPayloadToUserData(jwtPayload),
              scope: getScopeFromCustomJwtPayload(jwtPayload),
            };
          } catch (e: unknown) {
            console.error(
              `Failed to decode JSON web token (${sourceDescription}): `,
              e,
            );
            throw new Error(
              `Failed to decode JSON web token! (${sourceDescription})`,
              { cause: e },
            );
          }
        },
      },
      debug,
    );

    decoded_result = decoded;
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

  if (decoded_result) {
    const parsed_user = await userDataSchema.safeParseAsync(
      decoded_result.user,
    );
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

    // Scope is threaded ALONGSIDE the user, not inside it.
    return {
      user,
      scope: decoded_result.scope,
    };
  }

  return {
    user: null,
  };
}

export default decodeJWTsWithKeyManager;
