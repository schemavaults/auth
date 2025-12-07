// jwt_keys/index.ts
// JWT_Keys contains a set of keys used for JWT encryption and signing

export { JWT_Keys, JWT_Keys as default } from "./jwt_keys";
export type { I_JWT_Keys } from './I_JWT_Keys';

export { ContentEncryptionKeyPairFactory } from './ContentEncryptionKeyPairFactory';
export { SigningKeyPairFactory } from "./SigningKeyPairFactory";

export { generateNewJwtKeySet, generateJwtContentEncryptionKeyPair, generateJwtSigningKeyPair } from './generate_new_jwt_keyset';

import { to_public_jwks } from './to_public_jwks';
export { to_public_jwks };
type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;
export type { JWKS };
