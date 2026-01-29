import isValidUuid from "@/is-valid-uuid";
import type { IJwtKeyManager } from "@/JwtKeyManager";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { type JWKS, importAsymmetricJWK } from "@schemavaults/jwt";

export interface ILoadJwtDecodingKeysOptions {
  audience_id: ApiServerId;
  keyset_id: string;
  keys_manager: IJwtKeyManager;
  debug?: boolean;
}

export interface IDecodeAuthTokenKeys {
  keyset_id: string;
  verification_key: CryptoKey;
  decryption_key: CryptoKey;
}

export async function loadJwtDecodingKeysFromJwks(
  {
    keyset_id,
    jwks,
  }: {
    keyset_id: string;
    jwks: JWKS;
  },
  debug: boolean = false,
): Promise<IDecodeAuthTokenKeys> {
  if (jwks.keys.length === 0) {
    throw new Error(
      "JWKS appears to be empty, cannot extract decoding keys from empty set!",
    );
  }

  if (debug) {
    console.log(
      `loadJwtDecodingKeysFromJwks(keyset_id='${keyset_id}', jwks.keys.length='${jwks.keys.length}')`,
    );
  }

  // Loop over keys in JWKS and find the required keys
  let verification_key: CryptoKey | undefined = undefined;
  let decryption_key: CryptoKey | undefined = undefined;
  function allRequiredKeysFound(): boolean {
    return verification_key && decryption_key ? true : false;
  }
  for (const key of jwks.keys) {
    const kid = key.kid;
    if (typeof kid !== "string") {
      throw new TypeError(`Invalid JWK in JWKS; missing 'kid' string!`);
    }
    if (kid === `${keyset_id}-verification`) {
      verification_key = await importAsymmetricJWK(key);
      if (allRequiredKeysFound()) {
        break; // exit early if keys have been found
      } else {
        continue;
      }
    } else if (kid === `${keyset_id}-decryption`) {
      decryption_key = await importAsymmetricJWK(key);
      if (allRequiredKeysFound()) {
        break; // exit early if keys have been found
      } else {
        continue;
      }
    } else {
      continue; // not a match
    }
  }

  const foundRequiredDecodingKeys: boolean = allRequiredKeysFound();
  if (foundRequiredDecodingKeys && verification_key && decryption_key) {
    return {
      keyset_id,
      verification_key,
      decryption_key,
    } satisfies IDecodeAuthTokenKeys;
  }

  // Else, not all keys were found-- handle failure gracefully

  const listOfKidsInJwks: string = jwks.keys
    .map((k) => `'${k.kid}'`)
    .join(", ");
  if (!verification_key && !decryption_key) {
    console.error(
      `Missing both verification and decryption keys for keyset '${keyset_id}' from available keys: `,
      listOfKidsInJwks,
    );
    throw new Error(
      `Missing both verification and decryption keys for keyset '${keyset_id}'`,
    );
  } else if (!verification_key) {
    console.error(
      `Missing verification key for keyset '${keyset_id}' from available keys: `,
      listOfKidsInJwks,
    );
    throw new Error(`Missing verification key for keyset '${keyset_id}'`);
  } else if (!decryption_key) {
    console.error(
      `Missing decryption key for keyset '${keyset_id}' from available keys: `,
      listOfKidsInJwks,
    );
    throw new Error(`Missing decryption key for keyset '${keyset_id}'`);
  } else {
    throw new Error("Error handling missing JWT decoding keys gracefully!");
  }
}

export async function loadJwtDecodingKeys({
  keys_manager,
  keyset_id,
  audience_id,
  ...opts
}: ILoadJwtDecodingKeysOptions): Promise<IDecodeAuthTokenKeys> {
  const debug: boolean = opts.debug ?? false;

  if (!apiServerIdSchema.safeParse(audience_id).success) {
    throw new TypeError(
      `Invalid audience ID to load JWT decoding keys for: '${audience_id}'`,
    );
  } else if (!isValidUuid(keyset_id)) {
    throw new TypeError("Expected 'keyset_id' to be a valid UUID!");
  }

  let jwks: JWKS;
  try {
    jwks = await keys_manager.loadJwks(audience_id);
  } catch (e: unknown) {
    console.error("Failed to load JWKS from key manager: ", e);
    throw new Error("Failed to load JWKS from key manager!");
  }

  if (
    !jwks ||
    typeof jwks !== "object" ||
    !("keys" in jwks) ||
    !Array.isArray(jwks.keys)
  ) {
    throw new TypeError("Invalid JWKS; not an object or missing 'keys' array!");
  }

  if (jwks.keys.length === 0) {
    throw new Error(
      "Received JWKS from JwtKeyManager but it does not appear to include any keys." +
        " " +
        `(including the requested keyset_id '${keyset_id}')`,
    );
  }

  const jwt_decoding_keys: IDecodeAuthTokenKeys =
    await loadJwtDecodingKeysFromJwks({ keyset_id, jwks }, debug);

  return jwt_decoding_keys;
}

export default loadJwtDecodingKeys;
