import { sign_verify_alg } from "@/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { SignJWT } from "jose";
import { JWKS_ACCESS_PROOF_TOKEN_MAX_AGE } from "./constants";

export interface ICreateJwksAccessProofToken {
  api_server_id: ApiServerId;
  auth_server_url: string;
  private_key: CryptoKey;
}

export async function createJwksAccessProofToken({
  api_server_id,
  auth_server_url,
  private_key,
}: ICreateJwksAccessProofToken): Promise<string> {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }

  if (api_server_id === auth_server_url) {
    throw new Error(
      `'${auth_server_url}' does not use JWKS access proof tokens`,
    );
  }

  // The auth server requires exp, iat, jti, aud, and iss claims, and treats
  // each jti as single-use, so mint a fresh assertion for every request.
  const token_builder = new SignJWT({
    api_server_id,
  })
    .setSubject(api_server_id)
    .setIssuer(api_server_id)
    .setAudience(auth_server_url)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setNotBefore(new Date(Date.now() - 1))
    .setExpirationTime(JWKS_ACCESS_PROOF_TOKEN_MAX_AGE)
    .setProtectedHeader({
      alg: sign_verify_alg,
    });

  return await token_builder.sign(private_key);
}

export default createJwksAccessProofToken;
