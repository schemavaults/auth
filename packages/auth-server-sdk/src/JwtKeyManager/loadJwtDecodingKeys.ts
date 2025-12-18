import type { IJwtKeyManager } from "@/JwtKeyManager";
import { apiServerIdSchema } from "@schemavaults/app-definitions";
import { type JWKS, importAsymmetricJWK } from "@schemavaults/jwt";

export interface ILoadJwtDecodingKeysOptions {
  audience_id: string;
  keyset_id: string;
  keys_manager: IJwtKeyManager;
}

export interface IDecodeAuthTokenKeys {
  keyset_id: string;
  verification_key: CryptoKey;
  decryption_key: CryptoKey;
}

export async function loadJwtDecodingKeysFromJwks({
  keyset_id,
  jwks,
}: {
  keyset_id: string;
  jwks: JWKS;
}): Promise<IDecodeAuthTokenKeys> {
  const verification_kid: string = `${keyset_id}-verification`;
  const decryption_kid: string = `${keyset_id}-decryption`;
  let verification_key: CryptoKey | undefined = undefined;
  let decryption_key: CryptoKey | undefined = undefined;
  for (const key of jwks.keys) {
    const kid = key.kid;
    if (typeof kid !== "string") {
      throw new TypeError(`Invalid JWK in JWKS; missing 'kid' string!`);
    }
    if (kid === verification_kid) {
      verification_key = await importAsymmetricJWK(key);
    } else if (kid === decryption_kid) {
      decryption_key = await importAsymmetricJWK(key);
    } else {
      continue; // not a match
    }
  }

  if (!verification_key || !decryption_key) {
    throw new Error(
      `Missing verification or decryption key for keyset '${keyset_id}'`,
    );
  }

  return {
    keyset_id,
    verification_key,
    decryption_key,
  };
}

export async function loadJwtDecodingKeys({
  keys_manager,
  keyset_id,
  audience_id,
}: ILoadJwtDecodingKeysOptions): Promise<IDecodeAuthTokenKeys> {
  if (!apiServerIdSchema.safeParse(audience_id).success) {
    throw new Error(
      `Invalid audience ID to load JWT decoding keys for: '${audience_id}'`,
    );
  }

  const jwks: JWKS = await keys_manager.loadJwks(audience_id);
  if (
    !jwks ||
    typeof jwks !== "object" ||
    !("keys" in jwks) ||
    !Array.isArray(jwks.keys)
  ) {
    throw new TypeError("Invalid JWKS; not an object or missing 'keys' array!");
  }

  return await loadJwtDecodingKeysFromJwks({ keyset_id, jwks });
}

export default loadJwtDecodingKeys;
