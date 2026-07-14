// export {generateJWT} from './generate';
export { decodeJWT } from "./decode";
export { getExpiryTime, getExpiryDurationString } from "./expiry";
export { JWT_Factory } from "./jwt-factory";

export type { CustomJWTPayload } from "./payload_data";
export {
  customJwtPayloadToUserData,
  getScopeFromCustomJwtPayload,
} from "./custom-jwt-payload-to-user-data";

export {
  JWT_Keys,
  generateNewJwtKeySet,
  generateJwtSigningKeyPair,
  generateJwtContentEncryptionKeyPair,
  to_public_jwks,
  to_public_verification_jwks,
  importAsymmetricJWK,
  jsonSerializedJwtKeySchema,
  PEMFormat,
  ContentEncryptionKeyPairFactory,
  SigningKeyPairFactory,
} from "./jwt_keys";
export type * from "./jwt_keys";

export { generateIdToken, ID_TOKEN_EXPIRY } from "./generate_id_token";
export type {
  GenerateIdTokenOptions,
  GeneratedIdToken,
} from "./generate_id_token";

export { getKeysetIdFromToken } from "./get_keyset_id_from_token";
export { default as getAudienceFromToken } from "./get_audience_from_token";

export { refreshTokenExpiry, accessTokenExpiry } from "./expiry";

// Re-export jose functions for JWKS access key verification
export { jwtVerify, importSPKI, SignJWT, importPKCS8 } from "jose";
export type { JWTPayload, JWTVerifyResult } from "jose";

// Algorithms used
export { sign_verify_alg } from "./sign_verify_alg";
export { encrypt_decrypt_alg } from "./encrypt_decrypt_alg";
