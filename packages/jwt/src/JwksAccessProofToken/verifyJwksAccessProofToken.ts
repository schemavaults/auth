import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_AUTH_SERVER,
} from "@schemavaults/app-definitions";
import { jwtVerify } from "jose";
import signVerifyAlg, { sign_verify_alg } from "@/jwt/sign_verify_alg";

export interface IVerifyJwksAccessProofToken {
  token: string;
  api_server_id: ApiServerId;
  public_key: CryptoKey;
}

export async function verifyJwksAccessProofToken({
  token,
  api_server_id,
  public_key,
}: IVerifyJwksAccessProofToken): Promise<boolean> {
  if (typeof token !== "string") {
    throw new TypeError("Expected token to verify to be a string!");
  }

  if (!apiServerIdSchema.safeParse(api_server_id)) {
    throw new TypeError("Invalid API server ID!");
  }

  if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
    throw new Error(
      `'${SCHEMAVAULTS_AUTH_SERVER.api_server_id}' does not use JWKS access proof tokens`,
    );
  }

  const payload = await jwtVerify(token, public_key, {
    audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    issuer: api_server_id,
    subject: api_server_id,
    algorithms: [signVerifyAlg],
  });

  if (payload.payload.aud !== SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
    return false;
  }

  if (
    payload.payload.sub !== api_server_id ||
    payload.payload.iss !== api_server_id
  ) {
    return false;
  }

  if (payload.protectedHeader.alg !== sign_verify_alg) {
    return false;
  }

  return true;
}

export default verifyJwksAccessProofToken;
