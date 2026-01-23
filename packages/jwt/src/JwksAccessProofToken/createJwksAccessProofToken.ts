import { sign_verify_alg } from "@/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_AUTH_SERVER,
} from "@schemavaults/app-definitions";
import { SignJWT } from "jose";

export interface ICreateJwksAccessProofToken {
  api_server_id: ApiServerId;
  private_key: CryptoKey;
}

export async function createJwksAccessProofToken({
  api_server_id,
  private_key,
}: ICreateJwksAccessProofToken): Promise<string> {
  if (!apiServerIdSchema.safeParse(api_server_id)) {
    throw new TypeError("Invalid API server ID!");
  }

  if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
    throw new Error(
      `'${SCHEMAVAULTS_AUTH_SERVER.api_server_id}' does not use JWKS access proof tokens`,
    );
  }

  const token_builder = new SignJWT({
    api_server_id,
  })
    .setSubject(api_server_id)
    .setIssuer(api_server_id)
    .setAudience(SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id)
    .setNotBefore(new Date(Date.now() - 1))
    .setExpirationTime("2 min")
    .setProtectedHeader({
      alg: sign_verify_alg,
    });

  return await token_builder.sign(private_key);
}

export default createJwksAccessProofToken;
