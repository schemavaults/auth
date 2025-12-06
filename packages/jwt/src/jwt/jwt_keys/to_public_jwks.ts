import type JWT_Keys from "@/jwt/jwt_keys";
import type { JsonSerializedJwtKey } from "@/jwt/jwt_keys/JsonSerializedJwtKey";
import type { JwtKeyType } from "@/jwt/jwt_keys/ValidJwtKeyTypes";
import { exportJWK, type JWK } from "jose";

export async function to_public_jwks(active_keysets: JWT_Keys | readonly JWT_Keys[]): Promise<{ keys: readonly JWK[] }> {
  const keysets: readonly JWT_Keys[] = Array.isArray(active_keysets) ? active_keysets : [active_keysets];

  const output_jwks: JWK[] = [];

  for (const keyset of keysets) {
    const keyset_id: string = keyset.keyset_id;

    if (keyset.keyset_expiry && keyset.keyset_expiry < Date.now()) {
      // don't use any keys from this expired keyset
      continue;
    }

    const keys_in_set: readonly JsonSerializedJwtKey[] = keyset.listSerializedKeys()
    for (const key of keys_in_set) {
      const key_type: JwtKeyType = key.key_type;
      if (key_type !== 'decryption' && key_type !== 'verification') {
        continue; // Skip keys that are not decryption or verification keys
      }
      if (key.keyset_id !== keyset_id) {
        throw new Error(`Keyset ${keyset_id} contains a key that is not part of it!`);
      }
      const jose_activated_key = await keyset[`${key_type}_key`]
      const jwk: JWK = await exportJWK(jose_activated_key)
      output_jwks.push({
        ...jwk,
        kid: `${keyset_id}-${key.key_type}`
      });
      continue;
    }
  }

  return {
    keys: output_jwks
  };
}

export default to_public_jwks;
