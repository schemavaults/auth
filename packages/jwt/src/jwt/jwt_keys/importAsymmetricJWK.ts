import type { JWK } from "./JWK";
import { importJWK as importJsonWebKey } from "jose";

export async function importAsymmetricJWK(jwk: JWK): Promise<CryptoKey> {
  if (!("alg" in jwk)) {
    throw new Error("Invalid JWK: missing 'alg' property");
  }
  const activated_key = await importJsonWebKey(jwk);

  // Symmetric JSON Web Keys (i.e. kty: "oct") yield back an Uint8Array instead of a CryptoKey.
  // We're only using asymmetric keys, so we can safely ignore this case.

  if (activated_key instanceof Uint8Array) {
    throw new TypeError("Invalid JWK: asymmetric key expected");
  }

  return activated_key;
}

export default importAsymmetricJWK;
