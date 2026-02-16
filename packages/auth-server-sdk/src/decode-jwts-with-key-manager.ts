import { getAppEnvironment } from "@/get-app-environment";
import {
  decodeJWTs,
  type OrganizationID,
  type UserData,
  type PotentiallyValidTokenSource,
  type DecodeTokenFn,
  organizationIdSchema,
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
import getSchemavaultsApiServerId from "./get-schemavaults-api-server-id";
import {
  type CustomJWTPayload,
  decodeJWT as decodeSchemavaultsJwt,
  getKeysetIdFromToken,
} from "@schemavaults/jwt";
import isValidUuid from "@/is-valid-uuid";

type DecodeTokenFnOutput = Awaited<ReturnType<DecodeTokenFn>>;

export type IDecodeJWTsWithKeyManagerOutput =
  | {
      user: UserData;
      user_organizations: readonly OrganizationID[];
    }
  | {
      user: null;
      user_organizations: null;
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
      `[RouteGuardFactory] Initializing route guard from token sources: `,
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

  let user: UserData | null = null;
  let user_organizations: readonly OrganizationID[] | null = null;
  try {
    user = await decodeJWTs(
      {
        token_sources,
        jwt_audience,
        decodeJWT: async (opts): Promise<DecodeTokenFnOutput> => {
          if (debug) {
            console.log(`[RouteGuardFactory] Attempting to decode JWT...`);
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

    return {
      user: user satisfies UserData,
      user_organizations:
        user_organizations satisfies readonly OrganizationID[],
    };
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

  return {
    user: null,
    user_organizations: null,
  };
}

export default decodeJWTsWithKeyManager;
