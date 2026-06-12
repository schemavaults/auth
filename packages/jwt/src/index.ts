// @schemavaults/jwt - index.ts
export * from "@/jwt";
export type * from "@/jwt";

export {
  createJwksAccessProofToken,
  verifyJwksAccessProofToken,
  JWKS_ACCESS_PROOF_TOKEN_MAX_AGE,
  JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS,
} from "@/JwksAccessProofToken";

export { isValidBase64UrlEncoding } from "@/utils/isValidBase64UrlEncoding";
