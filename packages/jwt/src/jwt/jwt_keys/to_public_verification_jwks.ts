import type { I_JWT_Keys } from "@/jwt/jwt_keys";
import type { JsonSerializedJwtKey } from "@/jwt/jwt_keys/JsonSerializedJwtKey";
import { exportJWK, type JWK } from "jose";
import getAlgorithmForKey from "./getAlgorithmForKey";

/**
 * Builds a PUBLIC JWKS document containing ONLY the RS256 verification
 * (public) keys of the given keysets — the shape a spec-compliant OIDC
 * `jwks_uri` must serve.
 *
 * Deliberately separate from `to_public_jwks`, which also exports each
 * keyset's private RSA DECRYPTION key: that document exists for the
 * access-gated per-audience JWKS exchange with trusted resource servers
 * (which must decrypt the platform's JWE tokens) and must never be
 * served on a public endpoint.
 */
export async function to_public_verification_jwks(
  active_keysets: I_JWT_Keys | readonly I_JWT_Keys[],
): Promise<{ keys: readonly JWK[] }> {
  const keysets: readonly I_JWT_Keys[] = Array.isArray(active_keysets)
    ? active_keysets
    : [active_keysets];

  const output_jwks: JWK[] = [];

  for (const keyset of keysets) {
    const keyset_id: string = keyset.keyset_id;

    if (keyset.keyset_expiry && keyset.keyset_expiry < Date.now()) {
      // don't use any keys from this expired keyset
      continue;
    }

    const keys_in_set: readonly JsonSerializedJwtKey[] =
      keyset.listSerializedKeys();
    for (const key of keys_in_set) {
      if (key.key_type !== "verification") {
        continue;
      }
      if (key.privacy_level !== "public") {
        throw new Error(
          `Verification key in keyset '${keyset_id}' is not marked public!`,
        );
      }
      if (key.keyset_id !== keyset_id) {
        throw new Error(
          `Keyset '${keyset_id}' contains a key that is not part of it!`,
        );
      }

      const jose_activated_key: CryptoKey = await keyset.verification_key;
      const jwk: JWK = await exportJWK(jose_activated_key);
      output_jwks.push({
        ...jwk,
        kid: `${keyset_id}-verification`,
        alg: getAlgorithmForKey(key),
        use: "sig",
      });
    }
  }

  const keys: readonly JWK[] = output_jwks;
  if (keys.length === 0) {
    console.warn("[to_public_verification_jwks] Output 'keys' array is empty!");
  }

  return { keys };
}

export default to_public_verification_jwks;
