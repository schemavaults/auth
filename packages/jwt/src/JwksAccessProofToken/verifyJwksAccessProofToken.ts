import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { jwtVerify } from "jose";
import signVerifyAlg, { sign_verify_alg } from "@/jwt/sign_verify_alg";
import {
  JWKS_ACCESS_PROOF_TOKEN_MAX_AGE,
  JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS,
} from "./constants";

export interface IVerifyJwksAccessProofToken {
  token: string;
  api_server_id: ApiServerId;
  auth_server_url: string;
  public_key: CryptoKey;
}

export async function verifyJwksAccessProofToken({
  token,
  api_server_id,
  auth_server_url,
  public_key,
}: IVerifyJwksAccessProofToken): Promise<boolean> {
  if (typeof token !== "string") {
    throw new TypeError("Expected token to verify to be a string!");
  }

  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }

  if (api_server_id === auth_server_url) {
    throw new Error(
      `'${auth_server_url}' does not use JWKS access proof tokens`,
    );
  }

  const payload = await jwtVerify(token, public_key, {
    audience: auth_server_url,
    issuer: api_server_id,
    subject: api_server_id,
    algorithms: [signVerifyAlg],
    maxTokenAge: JWKS_ACCESS_PROOF_TOKEN_MAX_AGE,
    requiredClaims: [...JWKS_ACCESS_PROOF_TOKEN_REQUIRED_CLAIMS],
  });

  if (payload.payload.aud !== auth_server_url) {
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
